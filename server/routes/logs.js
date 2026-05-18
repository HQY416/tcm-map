const express = require('express');
const router = express.Router();
const db = require('../init-db');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, (req, res) => {
    const { action, target_type, target_id, detail } = req.body;
    const userId = req.user.id;

    if (!action) {
        return res.json({ success: false, message: '操作类型不能为空' });
    }

    db.run(
        'INSERT INTO operation_logs (user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)',
        [userId, action, target_type || null, target_id || null, detail || null],
        function (err) {
            if (err) {
                return res.json({ success: false, message: '记录操作日志失败' });
            }
            res.json({ success: true, message: '操作日志记录成功', id: this.lastID });
        }
    );
});

router.get('/', authenticateToken, (req, res) => {
    const { user_id, action, page = 1, pageSize = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, parseInt(pageSize));
    const offset = (pageNum - 1) * pageSizeNum;

    let whereClauses = [];
    let params = [];

    if (user_id) {
        whereClauses.push('ol.user_id = ?');
        params.push(user_id);
    }

    if (action) {
        whereClauses.push('ol.action LIKE ?');
        params.push(`%${action}%`);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) as total FROM operation_logs ol ${whereStr}`;
    const dataSql = `SELECT ol.*, u.username FROM operation_logs ol LEFT JOIN users u ON ol.user_id = u.id ${whereStr} ORDER BY ol.created_at DESC LIMIT ? OFFSET ?`;

    db.get(countSql, params, (err, countRow) => {
        if (err) {
            return res.json({ success: false, message: '查询操作日志失败' });
        }

        db.all(dataSql, [...params, pageSizeNum, offset], (err2, rows) => {
            if (err2) {
                return res.json({ success: false, message: '查询操作日志失败' });
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

module.exports = router;
