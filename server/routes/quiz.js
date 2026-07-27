const express = require('express');
const db = require('../init-db');
const { verifyVisitorId } = require('../middleware/auth');
const router = express.Router();

// 返回经过签名校验的 raw visitor_id;无效签名返回 'anonymous'(只读安全)
function getVisitorId(req) {
    const raw = req.headers['x-visitor-id'] || req.query.visitor_id || 'anonymous';
    return verifyVisitorId(raw) || 'anonymous';
}

// 返回签名校验后的 raw visitor_id,无效则返回 null(用于必须确认身份的写操作)
function getVerifiedVisitorId(req) {
    const raw = req.headers['x-visitor-id'] || req.query.visitor_id || req.body.visitor_id;
    return verifyVisitorId(raw);
}

router.get('/questions', function(req, res) {
    var visitorId = getVisitorId(req);
    var difficulty = req.query.difficulty || '';
    var category = req.query.category || '';

    var sql = 'SELECT * FROM quiz_questions WHERE is_active = 1';
    var params = [];
    if (difficulty) { sql += ' AND difficulty = ?'; params.push(difficulty); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY RANDOM() LIMIT 10';

    db.all(sql, params, function(err, questions) {
        if (err) return res.json({ success: false, message: err.message });

        db.all('SELECT question_id FROM quiz_answers WHERE visitor_id = ?', [visitorId], function(err2, answered) {
            if (err2) return res.json({ success: false, message: err2.message });
            var answeredIds = (answered || []).map(function(a) { return a.question_id; });
            var filtered = questions.filter(function(q) { return answeredIds.indexOf(q.id) === -1; });
            if (filtered.length === 0) {
                return res.json({ success: true, data: [], message: '你已经答完所有题目了！' });
            }
            var result = filtered.slice(0, 10).map(function(q) {
                return {
                    id: q.id,
                    question: q.question,
                    options: JSON.parse(q.options),
                    points: q.points,
                    difficulty: q.difficulty,
                    category: q.category
                };
            });
            res.json({ success: true, data: result });
        });
    });
});

router.post('/answer', function(req, res) {
    // 修复:答题涉及积分,必须验证 visitor_id 签名,防止冒充他人
    var visitorId = getVerifiedVisitorId(req);
    if (!visitorId) {
        return res.json({ success: false, code: 'INVALID_VISITOR', message: '访客标识无效,请刷新页面重试' });
    }
    var questionId = req.body.question_id;
    var selectedIndex = req.body.selected_index;

    if (!questionId || selectedIndex === undefined || selectedIndex === null) {
        return res.json({ success: false, message: '参数不完整' });
    }

    db.get('SELECT * FROM quiz_questions WHERE id = ? AND is_active = 1', [questionId], function(err, question) {
        if (err || !question) return res.json({ success: false, message: '题目不存在' });

        db.get('SELECT id FROM quiz_answers WHERE visitor_id = ? AND question_id = ?', [visitorId, questionId], function(err2, existing) {
            if (existing) return res.json({ success: false, message: '你已经回答过这道题了' });

            var isCorrect = selectedIndex === question.correct_index ? 1 : 0;
            var pointsEarned = isCorrect ? question.points : 0;

            db.run('INSERT INTO quiz_answers (visitor_id, question_id, selected_index, is_correct, points_earned) VALUES (?, ?, ?, ?, ?)',
                [visitorId, questionId, selectedIndex, isCorrect, pointsEarned], function(err3) {
                    if (err3) return res.json({ success: false, message: err3.message });

                    if (isCorrect) {
                        db.run('INSERT INTO quiz_points (visitor_id, total_points, correct_count, total_count) VALUES (?, ?, 1, 1) ' +
                            'ON CONFLICT(visitor_id) DO UPDATE SET total_points = total_points + ?, correct_count = correct_count + 1, total_count = total_count + 1, updated_at = CURRENT_TIMESTAMP',
                            [visitorId, pointsEarned, pointsEarned], function(err4) {
                                res.json({
                                    success: true,
                                    data: {
                                        is_correct: true,
                                        points_earned: pointsEarned,
                                        explanation: question.explanation,
                                        correct_index: question.correct_index
                                    }
                                });
                            });
                    } else {
                        db.run('INSERT INTO quiz_points (visitor_id, total_points, correct_count, total_count) VALUES (?, 0, 0, 1) ' +
                            'ON CONFLICT(visitor_id) DO UPDATE SET total_count = total_count + 1, updated_at = CURRENT_TIMESTAMP',
                            [visitorId], function(err4) {
                                res.json({
                                    success: true,
                                    data: {
                                        is_correct: false,
                                        points_earned: 0,
                                        explanation: question.explanation,
                                        correct_index: question.correct_index
                                    }
                                });
                            });
                    }
                });
        });
    });
});

router.get('/points', function(req, res) {
    var visitorId = getVisitorId(req);
    db.get('SELECT * FROM quiz_points WHERE visitor_id = ?', [visitorId], function(err, row) {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, data: row || { visitor_id: visitorId, total_points: 0, correct_count: 0, total_count: 0 } });
    });
});

router.get('/history', function(req, res) {
    var visitorId = getVisitorId(req);
    var page = parseInt(req.query.page) || 1;
    var limit = 20;
    var offset = (page - 1) * limit;

    db.all('SELECT a.*, q.question, q.difficulty, q.category FROM quiz_answers a JOIN quiz_questions q ON a.question_id = q.id WHERE a.visitor_id = ? ORDER BY a.answered_at DESC LIMIT ? OFFSET ?',
        [visitorId, limit, offset], function(err, rows) {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, data: rows || [] });
        });
});

router.get('/shop', function(req, res) {
    db.all('SELECT * FROM quiz_shop_items WHERE is_active = 1 ORDER BY points_cost ASC', [], function(err, rows) {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, data: rows || [] });
    });
});

router.post('/redeem', function(req, res) {
    // 修复:兑换涉及积分消耗,必须验证 visitor_id 签名
    var visitorId = getVerifiedVisitorId(req);
    if (!visitorId) {
        return res.json({ success: false, code: 'INVALID_VISITOR', message: '访客标识无效,请刷新页面重试' });
    }
    var itemId = req.body.item_id;

    if (!itemId) return res.json({ success: false, message: '请选择兑换商品' });

    db.get('SELECT * FROM quiz_shop_items WHERE id = ? AND is_active = 1', [itemId], function(err, item) {
        if (err || !item) return res.json({ success: false, message: '商品不存在' });
        if (item.stock <= 0) return res.json({ success: false, message: '商品已售罄' });

        db.get('SELECT * FROM quiz_points WHERE visitor_id = ?', [visitorId], function(err2, points) {
            if (err2) return res.json({ success: false, message: err2.message });
            var currentPoints = (points && points.total_points) || 0;
            if (currentPoints < item.points_cost) {
                return res.json({ success: false, message: '积分不足，还需要' + (item.points_cost - currentPoints) + '积分' });
            }

            // 修复:用单条事务 SQL 保证原子性,任一步失败整体回滚
            db.serialize(function() {
                db.run('BEGIN TRANSACTION', function(beginErr) {
                    if (beginErr) return res.json({ success: false, message: '事务启动失败' });

                    db.run('UPDATE quiz_points SET total_points = total_points - ?, updated_at = CURRENT_TIMESTAMP WHERE visitor_id = ?',
                        [item.points_cost, visitorId], function(err3) {
                            if (err3 || this.changes === 0) {
                                db.run('ROLLBACK');
                                return res.json({ success: false, message: '积分扣除失败' });
                            }

                            db.run('UPDATE quiz_shop_items SET stock = stock - 1 WHERE id = ? AND stock > 0', [itemId], function(err4) {
                                if (err4 || this.changes === 0) {
                                    db.run('ROLLBACK');
                                    return res.json({ success: false, message: '库存不足' });
                                }

                                db.run('INSERT INTO quiz_redemptions (visitor_id, item_id, points_cost, status) VALUES (?, ?, ?, ?)',
                                    [visitorId, itemId, item.points_cost, 'confirmed'], function(err5) {
                                        if (err5) {
                                            db.run('ROLLBACK');
                                            return res.json({ success: false, message: '兑换记录创建失败' });
                                        }
                                        db.run('COMMIT');
                                        res.json({ success: true, message: '兑换成功！', data: { item_name: item.name, points_cost: item.points_cost, remaining_points: currentPoints - item.points_cost } });
                                    });
                            });
                        });
                });
            });
        });
    });
});

router.get('/redemptions', function(req, res) {
    var visitorId = getVisitorId(req);
    db.all('SELECT r.*, s.name as item_name, s.description as item_description FROM quiz_redemptions r JOIN quiz_shop_items s ON r.item_id = s.id WHERE r.visitor_id = ? ORDER BY r.created_at DESC',
        [visitorId], function(err, rows) {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true, data: rows || [] });
        });
});

router.get('/stats', function(req, res) {
    db.get('SELECT COUNT(*) as total_questions FROM quiz_questions WHERE is_active = 1', [], function(err, q) {
        db.get('SELECT COUNT(DISTINCT visitor_id) as total_players FROM quiz_points', [], function(err2, p) {
            db.get('SELECT SUM(total_points) as total_points_earned FROM quiz_points', [], function(err3, tp) {
                res.json({
                    success: true,
                    data: {
                        total_questions: (q && q.total_questions) || 0,
                        total_players: (p && p.total_players) || 0,
                        total_points_earned: (tp && tp.total_points_earned) || 0
                    }
                });
            });
        });
    });
});

module.exports = router;
