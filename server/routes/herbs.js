const express = require('express');
const { Herb, HerbImage } = require('../models');
const { authenticateToken, checkOwnership } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../init-db');
const router = express.Router();

function escapeLike(str) {
    return str.replace(/[%_\\]/g, '\\$&');
}

var herbsUploadDir = path.join(__dirname, '..', 'uploads', 'herbs');
try {
    if (!fs.existsSync(herbsUploadDir)) {
        fs.mkdirSync(herbsUploadDir, { recursive: true });
    }
    var testFile = path.join(herbsUploadDir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
} catch (e) {
    console.error('上传目录创建失败:', e.message);
    herbsUploadDir = path.join(require('os').tmpdir(), 'herb_uploads');
    try {
        if (!fs.existsSync(herbsUploadDir)) {
            fs.mkdirSync(herbsUploadDir, { recursive: true });
        }
    } catch (e2) {
        console.error('临时目录也创建失败:', e2.message);
    }
}

var herbImageStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, herbsUploadDir);
    },
    filename: function(req, file, cb) {
        var ext = path.extname(file.originalname).toLowerCase();
        if (!ext || ['.jpg', '.jpeg', '.png', '.webp'].indexOf(ext) === -1) {
            ext = '.jpg';
        }
        cb(null, 'herb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + ext);
    }
});

var herbImageUpload = multer({
    storage: herbImageStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter: function(req, file, cb) {
        var allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        var ext = path.extname(file.originalname).toLowerCase();
        if (allowed.indexOf(ext) > -1) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 JPG、PNG、WEBP 格式图片'));
        }
    }
});

router.get('/', function(req, res) {
    Herb.findAll(function(err, herbs) {
        if (err) return res.json({ success: false, message: err.message });
        var herbsWithoutImage = herbs.filter(function(h) { return !h.image_url; });
        if (herbsWithoutImage.length === 0) {
            return res.json({ success: true, data: herbs });
        }
        var pending = herbsWithoutImage.length;
        herbsWithoutImage.forEach(function(herb) {
            HerbImage.findByHerbId(herb.id, function(imgErr, images) {
                if (!imgErr && images && images.length > 0) {
                    herb.image_url = images[0].image_url;
                    db.run('UPDATE herbs SET image_url = ? WHERE id = ?', [images[0].image_url, herb.id], function() {});
                }
                if (--pending === 0) {
                    res.json({ success: true, data: herbs });
                }
            });
        });
    });
});

router.get('/search', function(req, res) {
    var rawKeyword = req.query.keyword || '';
    var keyword = rawKeyword.trim();

    if (!keyword) {
        return Herb.findAll(function(err, herbs) {
            if (err) res.json({ success: false, message: err.message });
            else res.json({ success: true, data: herbs, total: herbs.length, keyword: '' });
        });
    }

    var safeKeyword = escapeLike(keyword);
    var likePattern = '%' + safeKeyword + '%';

    Herb.searchByKeyword(likePattern, keyword, function(err, results) {
        if (err) {
            console.error('Search error:', err);
            res.json({ success: false, message: '搜索出错', data: [], total: 0, keyword: keyword });
        } else {
            res.json({ success: true, data: results || [], total: (results || []).length, keyword: keyword });
        }
    });
});

router.get('/:id/images', function(req, res) {
    var herbId = req.params.id;
    HerbImage.findByHerbId(herbId, function(err, images) {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, data: images || [] });
    });
});

router.post('/:id/images', authenticateToken, function(req, res, next) {
    herbImageUpload.array('images', 5)(req, res, function(multerErr) {
        if (multerErr) {
            return handleMulterError(multerErr, res);
        }

        var herbId = req.params.id;
        var files = req.files;

        if (!files || files.length === 0) {
            return res.json({ success: false, message: '请选择要上传的图片' });
        }

        HerbImage.countByHerbId(herbId, function(err, row) {
            if (err) {
                cleanupFiles(files);
                return res.json({ success: false, message: err.message });
            }
            var currentCount = row ? row.count : 0;
            if (currentCount + files.length > 5) {
                cleanupFiles(files);
                return res.json({ success: false, message: '每味药材最多5张图片，当前已有' + currentCount + '张' });
            }

            var completed = 0;
            var savedImages = [];
            var hasError = false;

            files.forEach(function(file, index) {
                var imageUrl = '/uploads/herbs/' + file.filename;
                var sortOrder = currentCount + index;
                HerbImage.add(herbId, imageUrl, sortOrder, function(err2) {
                    if (hasError) return;
                    if (err2) {
                        hasError = true;
                        try { fs.unlinkSync(file.path); } catch(e) {}
                        return res.json({ success: false, message: err2.message });
                    }
                    savedImages.push({ image_url: imageUrl, sort_order: sortOrder });
                    completed++;
                    if (completed === files.length) {
                        db.get('SELECT image_url FROM herbs WHERE id = ?', [herbId], function(err4, row) {
                            if (!err4 && (!row || !row.image_url) && savedImages.length > 0) {
                                db.run('UPDATE herbs SET image_url = ? WHERE id = ?', [savedImages[0].image_url, herbId], function(err3) {
                                    res.json({ success: true, message: '上传成功', data: savedImages });
                                });
                            } else {
                                res.json({ success: true, message: '上传成功', data: savedImages });
                            }
                        });
                    }
                });
            });
        });
    });
});

router.delete('/:herbId/images/:imageId', authenticateToken, function(req, res) {
    var imageId = req.params.imageId;
    var herbId = req.params.herbId;

    HerbImage.findByHerbId(herbId, function(err, images) {
        if (err) return res.json({ success: false, message: err.message });
        var targetImage = (images || []).find(function(img) { return img.id == imageId; });
        if (!targetImage) return res.json({ success: false, message: '图片不存在' });

        if (targetImage.image_url) {
            var relativePath = targetImage.image_url.replace(/^\/+/, '');
            var filePath = path.join(__dirname, '..', relativePath);
            try { fs.unlinkSync(filePath); } catch(e) {}
        }

        HerbImage.delete(imageId, function(err2) {
            if (err2) return res.json({ success: false, message: err2.message });

            HerbImage.findByHerbId(herbId, function(err3, remainingImages) {
                if (!err3 && remainingImages && remainingImages.length > 0) {
                    var newMainUrl = remainingImages[0].image_url;
                    db.run('UPDATE herbs SET image_url = ? WHERE id = ?', [newMainUrl, herbId], function() {});
                } else if (!err3 && (!remainingImages || remainingImages.length === 0)) {
                    db.run('UPDATE herbs SET image_url = NULL WHERE id = ?', [herbId], function() {});
                }
                res.json({ success: true, message: '删除成功' });
            });
        });
    });
});

router.put('/:herbId/images/:imageId/replace', authenticateToken, function(req, res, next) {
    herbImageUpload.single('image')(req, res, function(multerErr) {
        if (multerErr) {
            return handleMulterError(multerErr, res);
        }

        var imageId = req.params.imageId;
        var herbId = req.params.herbId;
        var file = req.file;

        if (!file) {
            return res.json({ success: false, message: '请选择替换图片' });
        }

        HerbImage.findByHerbId(herbId, function(err, images) {
            if (err) {
                try { fs.unlinkSync(file.path); } catch(e) {}
                return res.json({ success: false, message: err.message });
            }
            var targetImage = (images || []).find(function(img) { return img.id == imageId; });
            if (!targetImage) {
                try { fs.unlinkSync(file.path); } catch(e) {}
                return res.json({ success: false, message: '图片不存在' });
            }

            if (targetImage.image_url) {
                var oldRelativePath = targetImage.image_url.replace(/^\/+/, '');
                var oldFilePath = path.join(__dirname, '..', oldRelativePath);
                try { fs.unlinkSync(oldFilePath); } catch(e) {}
            }

            var newImageUrl = '/uploads/herbs/' + file.filename;
            db.run('UPDATE herb_images SET image_url = ? WHERE id = ?', [newImageUrl, imageId], function(err2) {
                if (err2) {
                    try { fs.unlinkSync(file.path); } catch(e) {}
                    return res.json({ success: false, message: err2.message });
                }

                if (targetImage.sort_order === 0) {
                    db.run('UPDATE herbs SET image_url = ? WHERE id = ?', [newImageUrl, herbId], function() {});
                }
                res.json({ success: true, message: '替换成功', data: { image_url: newImageUrl } });
            });
        });
    });
});

router.get('/:id', function(req, res) {
    Herb.findById(req.params.id, function(err, herb) {
        if (err) return res.json({ success: false, message: err.message });
        if (!herb) return res.json({ success: false, message: '药材不存在' });
        if (!herb.image_url) {
            HerbImage.findByHerbId(herb.id, function(imgErr, images) {
                if (!imgErr && images && images.length > 0) {
                    herb.image_url = images[0].image_url;
                    db.run('UPDATE herbs SET image_url = ? WHERE id = ?', [images[0].image_url, herb.id], function() {});
                }
                res.json({ success: true, data: herb });
            });
        } else {
            res.json({ success: true, data: herb });
        }
    });
});

router.post('/', authenticateToken, function(req, res) {
    var data = Object.assign({}, req.body, { creator_id: req.user.id });
    Herb.create(data, function(err, result) {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '创建成功', id: this.lastID });
    });
});

router.put('/:id', authenticateToken, checkOwnership('herb'), function(req, res) {
    Herb.update(req.params.id, req.body, function(err) {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '更新成功' });
    });
});

router.delete('/:id', authenticateToken, checkOwnership('herb'), function(req, res) {
    HerbImage.findByHerbId(req.params.id, function(imgErr, images) {
        if (images && images.length > 0) {
            images.forEach(function(img) {
                if (img.image_url) {
                    var relativePath = img.image_url.replace(/^\/+/, '');
                    var filePath = path.join(__dirname, '..', relativePath);
                    try { fs.unlinkSync(filePath); } catch(e) {}
                }
            });
        }
        Herb.delete(req.params.id, function(err) {
            if (err) res.json({ success: false, message: err.message });
            else res.json({ success: true, message: '删除成功' });
        });
    });
});

function handleMulterError(err, res) {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.json({ success: false, message: '图片大小不能超过5MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.json({ success: false, message: '单次最多上传5张图片' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.json({ success: false, message: '上传字段名错误，请使用images字段' });
    }
    if (err.message && err.message.includes('仅支持')) {
        return res.json({ success: false, message: err.message });
    }
    console.error('Multer error:', err);
    return res.json({ success: false, message: '图片上传失败：' + (err.message || '未知错误') });
}

function cleanupFiles(files) {
    if (!files) return;
    files.forEach(function(f) {
        try { fs.unlinkSync(f.path); } catch(e) {}
    });
}

module.exports = router;
