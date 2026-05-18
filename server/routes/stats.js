const express = require('express');
const router = express.Router();
const db = require('../init-db');
const { authenticateToken } = require('../middleware/auth');

router.get('/overview', authenticateToken, (req, res) => {
    const queries = [
        'SELECT COUNT(*) as total FROM comments',
        'SELECT COUNT(*) as total FROM page_views',
        'SELECT COUNT(*) as total FROM likes',
        'SELECT COUNT(*) as total FROM feedback'
    ];

    const keys = ['total_comments', 'total_page_views', 'total_likes', 'total_feedback'];

    Promise.all(queries.map((sql) => {
        return new Promise((resolve) => {
            db.get(sql, (err, row) => {
                resolve(err ? 0 : row.total);
            });
        });
    })).then((values) => {
        const results = {};
        keys.forEach((key, index) => {
            results[key] = values[index];
        });
        res.json({ success: true, data: results });
    });
});

router.get('/comments', authenticateToken, (req, res) => {
    const period = req.query.period || 'day';
    const days = parseInt(req.query.days) || 30;

    let dateFormat;
    switch (period) {
        case 'week':
            dateFormat = "%Y-W%W";
            break;
        case 'month':
            dateFormat = "%Y-%m";
            break;
        default:
            dateFormat = "%Y-%m-%d";
    }

    const sql = `SELECT strftime('${dateFormat}', created_at) as date, COUNT(*) as count
                 FROM comments
                 WHERE created_at >= datetime('now', '-${days} days')
                 GROUP BY date
                 ORDER BY date DESC`;

    db.all(sql, (err, rows) => {
        if (err) {
            return res.json({ success: false, message: '获取评论统计失败' });
        }
        res.json({ success: true, data: rows || [] });
    });
});

router.get('/page-views', authenticateToken, (req, res) => {
    const period = req.query.period || 'day';
    const days = parseInt(req.query.days) || 30;

    let dateFormat;
    switch (period) {
        case 'week':
            dateFormat = "%Y-W%W";
            break;
        case 'month':
            dateFormat = "%Y-%m";
            break;
        default:
            dateFormat = "%Y-%m-%d";
    }

    const sql = `SELECT strftime('${dateFormat}', created_at) as date,
                        COUNT(*) as count,
                        COUNT(DISTINCT visitor_id) as unique_visitors
                 FROM page_views
                 WHERE created_at >= datetime('now', '-${days} days')
                 GROUP BY date
                 ORDER BY date DESC`;

    db.all(sql, (err, rows) => {
        if (err) {
            return res.json({ success: false, message: '获取浏览量统计失败' });
        }
        res.json({ success: true, data: rows || [] });
    });
});

router.get('/likes', authenticateToken, (req, res) => {
    const totalPromise = new Promise((resolve) => {
        db.get('SELECT COUNT(*) as total FROM likes', (err, row) => {
            resolve(err ? 0 : row.total);
        });
    });

    const trendPromise = new Promise((resolve) => {
        db.all(`SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
                FROM likes
                GROUP BY date
                ORDER BY date DESC
                LIMIT 30`, (err, rows) => {
            resolve(err ? [] : (rows || []));
        });
    });

    const topContentPromise = new Promise((resolve) => {
        db.all(`SELECT l.target_type, l.target_id, COUNT(*) as like_count,
                CASE WHEN l.target_type = 'herb' THEN h.name
                     WHEN l.target_type = 'recipe' THEN r.title
                     WHEN l.target_type = 'video' THEN v.title
                     ELSE '未知' END as target_name
                FROM likes l
                LEFT JOIN herbs h ON l.target_type = 'herb' AND l.target_id = h.id
                LEFT JOIN recipes r ON l.target_type = 'recipe' AND l.target_id = r.id
                LEFT JOIN videos v ON l.target_type = 'video' AND l.target_id = v.id
                GROUP BY l.target_type, l.target_id
                ORDER BY like_count DESC
                LIMIT 10`, (err, rows) => {
            resolve(err ? [] : (rows || []).map(function(row) {
                return {
                    target_type: row.target_type,
                    target_id: row.target_id,
                    herb_id: row.target_type === 'herb' ? row.target_id : null,
                    herb_name: row.target_type === 'herb' ? row.target_name : null,
                    recipe_name: row.target_type === 'recipe' ? row.target_name : null,
                    video_name: row.target_type === 'video' ? row.target_name : null,
                    like_count: row.like_count,
                    display_name: row.target_name || ('#' + row.target_id)
                };
            }));
        });
    });

    Promise.all([totalPromise, trendPromise, topContentPromise]).then(function([total, trend, top_content]) {
        res.json({ success: true, data: { total, trend, top_content } });
    });
});

router.post('/page-view', (req, res) => {
    const { page_type, page_id, visitor_id, referer } = req.body;

    if (!page_type || !visitor_id) {
        return res.json({ success: false, message: '缺少必要参数' });
    }

    db.run(
        'INSERT INTO page_views (page_type, page_id, visitor_id, referer) VALUES (?, ?, ?, ?)',
        [page_type, page_id || null, visitor_id, referer || null],
        function (err) {
            if (err) {
                return res.json({ success: false, message: '记录浏览失败' });
            }
            res.json({ success: true, message: '浏览记录已保存' });
        }
    );
});

module.exports = router;
