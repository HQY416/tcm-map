const express = require('express');
const router = express.Router();
const db = require('../init-db');
const { verifyVisitorId } = require('../middleware/auth');

// 验证 visitor_id 签名,无效返回 null
function getVerifiedVisitorId(req) {
    const raw = req.headers['x-visitor-id'] || req.query.visitor_id || req.body.visitor_id;
    return verifyVisitorId(raw);
}

router.post('/', (req, res) => {
    const { target_type, target_id } = req.body;
    // 修复:visitor_id 必须为服务端签发,防止冒充他人点赞/取消
    const visitor_id = getVerifiedVisitorId(req);
    if (!visitor_id) {
        return res.json({ success: false, code: 'INVALID_VISITOR', message: '访客标识无效,请刷新页面重试' });
    }

    if (!target_type || !target_id) {
        return res.json({ success: false, message: '缺少必要参数' });
    }

    db.run(
        'INSERT INTO likes (target_type, target_id, visitor_id) VALUES (?, ?, ?)',
        [target_type, target_id, visitor_id],
        function (err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE constraint failed')) {
                    return res.json({ success: false, message: '已经点过赞了' });
                }
                return res.json({ success: false, message: '点赞失败' });
            }
            db.get(
                'SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?',
                [target_type, target_id],
                (err2, row) => {
                    res.json({ success: true, message: '点赞成功', data: { count: err2 ? 0 : row.count } });
                }
            );
        }
    );
});

router.delete('/', (req, res) => {
    const { target_type, target_id } = req.body;
    const visitor_id = getVerifiedVisitorId(req);
    if (!visitor_id) {
        return res.json({ success: false, code: 'INVALID_VISITOR', message: '访客标识无效,请刷新页面重试' });
    }

    if (!target_type || !target_id) {
        return res.json({ success: false, message: '缺少必要参数' });
    }

    db.run(
        'DELETE FROM likes WHERE target_type = ? AND target_id = ? AND visitor_id = ?',
        [target_type, target_id, visitor_id],
        function (err) {
            if (err) {
                return res.json({ success: false, message: '取消点赞失败' });
            }
            if (this.changes === 0) {
                return res.json({ success: false, message: '未找到点赞记录' });
            }
            db.get(
                'SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?',
                [target_type, target_id],
                (err2, row) => {
                    res.json({ success: true, message: '取消点赞成功', data: { count: err2 ? 0 : row.count } });
                }
            );
        }
    );
});

router.get('/count/:target_type/:target_id', (req, res) => {
    const { target_type, target_id } = req.params;

    db.get(
        'SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?',
        [target_type, target_id],
        (err, row) => {
            if (err) {
                return res.json({ success: false, message: '获取点赞数失败' });
            }
            res.json({ success: true, data: { count: row.count } });
        }
    );
});

router.get('/batch/:target_type', (req, res) => {
    const { target_type } = req.params;
    const target_ids = req.query.ids || '';

    if (!target_ids) {
        return res.json({ success: true, data: {} });
    }

    const ids = target_ids.split(',').filter(Boolean);
    if (ids.length === 0) {
        return res.json({ success: true, data: {} });
    }

    const placeholders = ids.map(() => '?').join(',');
    const sql = `SELECT target_id, COUNT(*) as count FROM likes WHERE target_type = ? AND target_id IN (${placeholders}) GROUP BY target_id`;
    const params = [target_type, ...ids];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.json({ success: false, message: '获取点赞数失败' });
        }
        const result = {};
        (rows || []).forEach(function(row) {
            result[row.target_id] = row.count;
        });
        res.json({ success: true, data: result });
    });
});

module.exports = router;
