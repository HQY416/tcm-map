const express = require('express');
const router = express.Router();
const db = require('../init-db');
const { authenticateToken } = require('../middleware/auth');

const commentCache = new Map();
const CACHE_TTL = 30000;

function getCacheKey(herbId, page, pageSize) {
    return herbId + ':' + page + ':' + pageSize;
}

function invalidateCache(herbId) {
    var keysToDelete = [];
    for (var key of commentCache.keys()) {
        if (key.startsWith(herbId + ':')) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(function(k) { commentCache.delete(k); });
}

router.get('/all', authenticateToken, (req, res) => {
    const keyword = req.query.keyword || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    let countSql = 'SELECT COUNT(*) as total FROM comments';
    let dataSql = 'SELECT c.id, c.herb_id, c.nickname, c.content, c.created_at, h.name as herb_name FROM comments c LEFT JOIN herbs h ON c.herb_id = h.id';
    const params = [];

    if (keyword) {
        const like = '%' + keyword + '%';
        countSql += ' WHERE nickname LIKE ? OR content LIKE ?';
        dataSql += ' WHERE c.nickname LIKE ? OR c.content LIKE ?';
        params.push(like, like);
    }

    dataSql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';

    db.get(countSql, params, (err, row) => {
        if (err) return res.json({ success: false, message: '查询失败' });
        const total = row ? row.total : 0;
        db.all(dataSql, [...params, pageSize, offset], (err2, rows) => {
            if (err2) return res.json({ success: false, message: '查询失败' });
            res.json({ success: true, data: rows || [], total, page, pageSize });
        });
    });
});

router.get('/:herbId', (req, res) => {
    const herbId = req.params.herbId;
    if (!herbId) {
        return res.json({ success: false, message: '缺少药材ID' });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const cacheKey = getCacheKey(herbId, page, pageSize);
    const cached = commentCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return res.json(cached.data);
    }

    const countSql = 'SELECT COUNT(*) as total FROM comments WHERE herb_id = ?';
    const dataSql = 'SELECT id, nickname, content, created_at FROM comments WHERE herb_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';

    db.get(countSql, [herbId], (err, countRow) => {
        if (err) {
            return res.json({ success: false, message: '获取评论失败' });
        }
        const total = countRow ? countRow.total : 0;
        db.all(dataSql, [herbId, pageSize, offset], (err2, rows) => {
            if (err2) {
                return res.json({ success: false, message: '获取评论失败' });
            }
            const result = {
                success: true,
                data: rows || [],
                total: total,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(total / pageSize)
            };
            commentCache.set(cacheKey, { data: result, time: Date.now() });
            res.json(result);
        });
    });
});

router.post('/', (req, res) => {
    const { herb_id, nickname, content } = req.body;

    if (!herb_id || !herb_id.trim()) {
        return res.json({ success: false, message: '缺少药材ID' });
    }
    if (!nickname || !nickname.trim()) {
        return res.json({ success: false, message: '请输入昵称' });
    }
    if (!content || !content.trim()) {
        return res.json({ success: false, message: '请输入评论内容' });
    }
    if (nickname.trim().length > 20) {
        return res.json({ success: false, message: '昵称不能超过20个字符' });
    }
    if (content.trim().length > 500) {
        return res.json({ success: false, message: '评论内容不能超过500个字符' });
    }

    db.run(
        'INSERT INTO comments (herb_id, nickname, content) VALUES (?, ?, ?)',
        [herb_id.trim(), nickname.trim(), content.trim()],
        function (err) {
            if (err) {
                return res.json({ success: false, message: '评论提交失败' });
            }
            invalidateCache(herb_id.trim());
            db.get(
                'SELECT id, nickname, content, created_at FROM comments WHERE id = ?',
                [this.lastID],
                (err2, row) => {
                    if (err2 || !row) {
                        return res.json({ success: true, message: '评论已提交', data: null });
                    }
                    res.json({ success: true, message: '评论提交成功', data: row });
                }
            );
        }
    );
});

router.delete('/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    db.get('SELECT herb_id FROM comments WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.json({ success: false, message: '删除失败' });
        }
        db.run('DELETE FROM comments WHERE id = ?', [id], function (err2) {
            if (err2) {
                return res.json({ success: false, message: '删除失败' });
            }
            if (row && row.herb_id) {
                invalidateCache(row.herb_id);
            }
            res.json({ success: true, message: '删除成功' });
        });
    });
});

module.exports = router;
