const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../init-db');
const { Video, Herb } = require('../models');
const { authenticateToken, checkOwnership } = require('../middleware/auth');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `video_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.mp4', '.webm', '.mov', '.avi'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 MP4, WebM, MOV, AVI 格式视频'));
        }
    },
    limits: { fileSize: 500 * 1024 * 1024 }
});

router.get('/', (req, res) => {
    Video.findAll((err, videos) => {
        if (err) return res.json({ success: false, message: err.message });
        var pending = videos.length;
        if (pending === 0) return res.json({ success: true, data: [] });
        videos.forEach(function(v) {
            Video.getRelatedHerbNames(v.id, function(err2, herbs) {
                v.herbNames = (herbs || []).map(function(h) { return h.name; });
                v.herbIds = (herbs || []).map(function(h) { return h.id; });
                if (--pending === 0) {
                    res.json({ success: true, data: videos });
                }
            });
        });
    });
});

router.get('/herb/:herbId', (req, res) => {
    Video.findByHerbId(req.params.herbId, (err, videos) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, data: videos || [] });
    });
});

router.get('/:id', (req, res) => {
    Video.findById(req.params.id, (err, video) => {
        if (err || !video) return res.json({ success: false, message: '视频不存在' });
        Video.getRelatedHerbNames(video.id, (err2, herbs) => {
            video.herbNames = (herbs || []).map(function(h) { return h.name; });
            video.herbIds = (herbs || []).map(function(h) { return h.id; });
            res.json({ success: true, data: video });
        });
    });
});

router.post('/upload', authenticateToken, upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: '未选择视频文件' });
    }

    const data = {
        title: req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname)),
        description: req.body.description || '',
        file_path: `/uploads/${req.file.filename}`,
        file_name: req.file.originalname,
        thumbnail: req.body.thumbnail || '',
        uploader_id: req.user.id
    };

    Video.create(data, function(err) {
        if (err) {
            res.json({ success: false, message: err.message });
        } else {
            res.json({ 
                success: true, 
                message: '视频上传成功',
                videoId: this.lastID,
                filePath: data.file_path
            });
        }
    });
});

router.post('/relate', authenticateToken, (req, res) => {
    const { herbId, videoId } = req.body;
    if (!herbId || !videoId) {
        return res.json({ success: false, message: '缺少 herbId 或 videoId' });
    }

    Video.relateToHerb(herbId, videoId, (err) => {
        if (err) res.json({ success: false, message: '关联失败或已存在此关系' });
        else res.json({ success: true, message: '关联成功' });
    });
});

router.post('/unrelate', authenticateToken, (req, res) => {
    const { herbId, videoId } = req.body;
    if (!herbId || !videoId) {
        return res.json({ success: false, message: '缺少 herbId 或 videoId' });
    }
    Video.unrelateHerb(herbId, videoId, (err) => {
        if (err) res.json({ success: false, message: '取消关联失败' });
        else res.json({ success: true, message: '已取消关联' });
    });
});

router.put('/:id', authenticateToken, (req, res) => {
    const videoId = req.params.id;
    const isAdmin = req.user.role === 'admin';

    Video.findById(videoId, (err, video) => {
        if (err || !video) {
            return res.json({ success: false, message: '视频不存在' });
        }
        if (!isAdmin && video.uploader_id !== req.user.id) {
            return res.json({ success: false, message: '无权限修改此视频' });
        }

        const { title, description, herbIds } = req.body;
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;

        Video.update(videoId, updateData, (err2) => {
            if (err2) return res.json({ success: false, message: '更新失败' });

            if (herbIds !== undefined) {
                db.run('DELETE FROM herb_video_relation WHERE video_id = ?', [videoId], () => {
                    var pending = herbIds.length;
                    if (pending === 0) return res.json({ success: true, message: '更新成功' });
                    herbIds.forEach(function(hid) {
                        Video.relateToHerb(hid, videoId, () => {
                            if (--pending === 0) {
                                res.json({ success: true, message: '更新成功' });
                            }
                        });
                    });
                });
            } else {
                res.json({ success: true, message: '更新成功' });
            }
        });
    });
});

router.delete('/:id', authenticateToken, (req, res) => {
    const videoId = req.params.id;
    const isAdmin = req.user.role === 'admin';

    Video.findById(videoId, (err, video) => {
        if (err || !video) {
            return res.json({ success: false, message: '视频不存在' });
        }
        if (!isAdmin && video.uploader_id !== req.user.id) {
            return res.json({ success: false, message: '无权限删除此视频' });
        }

        if (video.file_path) {
            const localPath = path.join(__dirname, '..', video.file_path);
            if (fs.existsSync(localPath)) {
                try { fs.unlinkSync(localPath); } catch(e) {}
            }
        }

        Video.delete(videoId, (err2) => {
            if (err2) res.json({ success: false, message: err2.message });
            else res.json({ success: true, message: '删除成功' });
        });
    });
});

module.exports = router;
