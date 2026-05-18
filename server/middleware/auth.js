const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = 'chinese-medicine-herb-secret-key-2024';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: '令牌无效或已过期' });
        }
        
        User.findById(user.id, (err, userData) => {
            if (err || !userData) {
                return res.status(403).json({ success: false, message: '用户不存在' });
            }
            req.user = userData;
            next();
        });
    });
};

const checkOwnership = (modelName, idField = 'id') => {
    return (req, res, next) => {
        const { User, Herb, Recipe, Video } = require('../models');
        const ModelMap = { herb: Herb, recipe: Recipe, video: Video };
        const Model = ModelMap[modelName];
        
        if (!Model) return res.status(500).json({ success: false, message: '模型错误' });
        
        const itemId = req.params[idField] || req.body[idField];
        const isAdmin = req.user.role === 'admin';
        
        Model.findById(itemId, (err, item) => {
            if (err || !item) {
                return res.status(404).json({ success: false, message: '资源不存在' });
            }
            
            if (!isAdmin && item.creator_id && item.creator_id !== req.user.id) {
                return res.status(403).json({ success: false, message: '无权限操作此资源' });
            }
            
            req.item = item;
            next();
        });
    };
};

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

module.exports = { authenticateToken, checkOwnership, generateToken, JWT_SECRET };
