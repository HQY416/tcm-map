const express = require('express');
const { Recipe } = require('../models');
const { authenticateToken, checkOwnership } = require('../middleware/auth');
const db = require('../init-db');
const router = express.Router();

router.get('/', (req, res) => {
    const onlyPublished = req.query.published === 'true';
    Recipe.findAll(onlyPublished, (err, recipes) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, data: recipes });
    });
});

router.get('/herb/:herbId', (req, res) => {
    Recipe.findByHerbId(req.params.herbId, (err, recipes) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, data: recipes });
    });
});

router.get('/:id/herbs', (req, res) => {
    Recipe.getRelatedHerbNames(req.params.id, (err, herbs) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, data: herbs });
    });
});

router.put('/:id/herbs', authenticateToken, checkOwnership('recipe'), (req, res) => {
    const recipeId = req.params.id;
    const herbIds = req.body.herb_ids || [];
    db.run('DELETE FROM herb_recipe_relation WHERE recipe_id = ?', [recipeId], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        if (herbIds.length === 0) return res.json({ success: true, message: '关联更新成功' });
        const stmt = db.prepare('INSERT OR IGNORE INTO herb_recipe_relation (herb_id, recipe_id) VALUES (?, ?)');
        let pending = herbIds.length;
        herbIds.forEach(hid => {
            stmt.run(hid, recipeId, () => {
                if (--pending === 0) {
                    stmt.finalize();
                    res.json({ success: true, message: '关联更新成功' });
                }
            });
        });
    });
});

router.get('/:id', (req, res) => {
    Recipe.findById(req.params.id, (err, recipe) => {
        if (err) res.json({ success: false, message: err.message });
        else if (!recipe) res.json({ success: false, message: '食谱不存在' });
        else res.json({ success: true, data: recipe });
    });
});

router.post('/', authenticateToken, (req, res) => {
    const data = { ...req.body, creator_id: req.user.id };
    Recipe.create(data, function(err, result) {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '创建成功', id: result.lastID });
    });
});

router.put('/:id', authenticateToken, checkOwnership('recipe'), (req, res) => {
    Recipe.update(req.params.id, req.body, (err) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '更新成功' });
    });
});

router.patch('/:id/publish', authenticateToken, checkOwnership('recipe'), (req, res) => {
    // 修复:复用全局 db 实例,避免每次请求新建连接导致句柄泄漏
    db.run('UPDATE recipes SET is_published = NOT is_published WHERE id = ?', [req.params.id], function(err) {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '状态更新成功' });
    });
});

router.delete('/:id', authenticateToken, checkOwnership('recipe'), (req, res) => {
    Recipe.delete(req.params.id, (err) => {
        if (err) res.json({ success: false, message: err.message });
        else res.json({ success: true, message: '删除成功' });
    });
});

module.exports = router;
