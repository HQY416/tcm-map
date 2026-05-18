const express = require('express');
const router = express.Router();
const db = require('../init-db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'feedback');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        var ext = path.extname(file.originalname) || '.png';
        cb(null, 'feedback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + ext);
    }
});

var upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        var allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        var ext = path.extname(file.originalname).toLowerCase();
        if (allowed.indexOf(ext) > -1) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 JPG、PNG、GIF、WebP 格式图片'));
        }
    }
});

const SENSITIVE_WORDS = [' fuck ', ' shit ', '傻逼', '操你'];

function filterSensitiveWords(text) {
    if (!text) return text;
    let result = text;
    SENSITIVE_WORDS.forEach(word => {
        result = result.split(word).join('***');
    });
    return result;
}

const VALID_TYPES = ['功能异常', '内容建议', '其他问题', '药材相关问题', '内容说明不清晰', '内容错误'];
const VALID_STATUSES = ['pending', 'processing', 'resolved'];

router.post('/', upload.single('screenshot'), (req, res) => {
    const { type, content, contact } = req.body;

    if (!type || !content) {
        return res.json({ success: false, message: '反馈类型和内容不能为空' });
    }

    if (!VALID_TYPES.includes(type)) {
        return res.json({ success: false, message: '反馈类型无效' });
    }

    if (content.length > 1000) {
        return res.json({ success: false, message: '问题描述不能超过1000字' });
    }

    const filteredContent = filterSensitiveWords(content);
    const filteredContact = contact ? filterSensitiveWords(contact) : null;
    const screenshotPath = req.file ? '/uploads/feedback/' + req.file.filename : null;

    db.run(
        'INSERT INTO feedback (type, content, contact, screenshot) VALUES (?, ?, ?, ?)',
        [type, filteredContent, filteredContact, screenshotPath],
        function (err) {
            if (err) {
                return res.json({ success: false, message: '提交反馈失败' });
            }
            res.json({ success: true, message: '反馈提交成功', id: this.lastID });
        }
    );
});

router.get('/', authenticateToken, (req, res) => {
    const { status, page = 1, pageSize = 10, keyword } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, parseInt(pageSize));
    const offset = (pageNum - 1) * pageSizeNum;

    let whereClauses = [];
    let params = [];

    if (status && VALID_STATUSES.includes(status)) {
        whereClauses.push('f.status = ?');
        params.push(status);
    }

    if (keyword) {
        whereClauses.push('(f.content LIKE ? OR f.type LIKE ? OR f.contact LIKE ?)');
        const likePattern = `%${keyword}%`;
        params.push(likePattern, likePattern, likePattern);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) as total FROM feedback f ${whereStr}`;
    const dataSql = `SELECT f.* FROM feedback f ${whereStr} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`;

    db.get(countSql, params, (err, countRow) => {
        if (err) {
            return res.json({ success: false, message: '获取反馈列表失败' });
        }

        db.all(dataSql, [...params, pageSizeNum, offset], (err2, rows) => {
            if (err2) {
                return res.json({ success: false, message: '获取反馈列表失败' });
            }
            res.json({
                success: true,
                data: {
                    list: rows || [],
                    total: countRow.total,
                    page: pageNum,
                    pageSize: pageSizeNum,
                    totalPages: Math.ceil(countRow.total / pageSizeNum)
                }
            });
        });
    });
});

router.get('/:id', authenticateToken, (req, res) => {
    const feedbackId = req.params.id;

    db.get('SELECT * FROM feedback WHERE id = ?', [feedbackId], (err, feedback) => {
        if (err) {
            return res.json({ success: false, message: '获取反馈详情失败' });
        }
        if (!feedback) {
            return res.json({ success: false, message: '反馈不存在' });
        }

        db.all(
            'SELECT fr.*, u.username as admin_name FROM feedback_replies fr LEFT JOIN users u ON fr.admin_id = u.id WHERE fr.feedback_id = ? ORDER BY fr.created_at ASC',
            [feedbackId],
            (err2, replies) => {
                if (err2) {
                    return res.json({ success: false, message: '获取回复列表失败' });
                }
                feedback.replies = replies || [];
                res.json({ success: true, data: feedback });
            }
        );
    });
});

router.post('/:id/reply', authenticateToken, (req, res) => {
    const feedbackId = req.params.id;
    const { content } = req.body;
    const adminId = req.user.id;

    if (!content) {
        return res.json({ success: false, message: '回复内容不能为空' });
    }

    db.get('SELECT * FROM feedback WHERE id = ?', [feedbackId], (err, feedback) => {
        if (err) {
            return res.json({ success: false, message: '查询反馈失败' });
        }
        if (!feedback) {
            return res.json({ success: false, message: '反馈不存在' });
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run(
                'INSERT INTO feedback_replies (feedback_id, admin_id, content) VALUES (?, ?, ?)',
                [feedbackId, adminId, content],
                function (err2) {
                    if (err2) {
                        db.run('ROLLBACK');
                        return res.json({ success: false, message: '回复失败' });
                    }

                    db.run(
                        'UPDATE feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        ['processing', feedbackId],
                        function (err3) {
                            if (err3) {
                                db.run('ROLLBACK');
                                return res.json({ success: false, message: '更新反馈状态失败' });
                            }

                            db.run('COMMIT');
                            res.json({ success: true, message: '回复成功', replyId: this.lastID });
                        }
                    );
                }
            );
        });
    });
});

router.put('/:id/status', authenticateToken, (req, res) => {
    const feedbackId = req.params.id;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
        return res.json({ success: false, message: '状态无效，应为：pending、processing、resolved' });
    }

    db.get('SELECT * FROM feedback WHERE id = ?', [feedbackId], (err, feedback) => {
        if (err) {
            return res.json({ success: false, message: '查询反馈失败' });
        }
        if (!feedback) {
            return res.json({ success: false, message: '反馈不存在' });
        }

        db.run(
            'UPDATE feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, feedbackId],
            function (err2) {
                if (err2) {
                    return res.json({ success: false, message: '更新状态失败' });
                }
                res.json({ success: true, message: '状态更新成功' });
            }
        );
    });
});

module.exports = router;
