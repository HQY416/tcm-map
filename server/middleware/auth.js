const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');

// JWT 密钥:优先从环境变量读取,避免硬编码泄露
const JWT_SECRET = process.env.JWT_SECRET || 'chinese-medicine-herb-secret-key-2024-dev-only';
if (!process.env.JWT_SECRET) {
    console.warn('[安全警告] 未设置 JWT_SECRET 环境变量,正在使用开发默认密钥,请勿用于生产环境');
}

// 访客标识签名密钥(用于防止 visitor_id 被客户端伪造)
const VISITOR_SECRET = process.env.VISITOR_SECRET || JWT_SECRET;

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
        const { Herb, Recipe, Video } = require('../models');
        const ModelMap = { herb: Herb, recipe: Recipe, video: Video };
        const Model = ModelMap[modelName];

        if (!Model) return res.status(500).json({ success: false, message: '模型错误' });

        const itemId = req.params[idField] || req.body[idField];
        const isAdmin = req.user.role === 'admin';

        Model.findById(itemId, (err, item) => {
            if (err || !item) {
                return res.status(404).json({ success: false, message: '资源不存在' });
            }

            // 修复:creator_id 为空时,仅管理员可操作;否则必须为创建者本人
            if (!isAdmin) {
                if (item.creator_id === null || item.creator_id === undefined) {
                    return res.status(403).json({ success: false, message: '无权限操作此资源' });
                }
                if (item.creator_id !== req.user.id) {
                    return res.status(403).json({ success: false, message: '无权限操作此资源' });
                }
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

// 访客标识签名工具:服务端签发带 HMAC 签名的 visitor_id,客户端无法伪造他人身份
function issueVisitorId(rawId) {
    if (!rawId) {
        rawId = 'v_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    }
    const sig = crypto.createHmac('sha256', VISITOR_SECRET).update(rawId).digest('hex').slice(0, 16);
    return rawId + '.' + sig;
}

// 校验 visitor_id 签名,有效返回 rawId,无效返回 null
function verifyVisitorId(signedId) {
    if (!signedId || typeof signedId !== 'string') return null;
    const idx = signedId.lastIndexOf('.');
    if (idx <= 0) return null;
    const rawId = signedId.slice(0, idx);
    const sig = signedId.slice(idx + 1);
    if (!rawId || !sig) return null;
    const expected = crypto.createHmac('sha256', VISITOR_SECRET).update(rawId).digest('hex').slice(0, 16);
    try {
        const a = Buffer.from(sig, 'hex');
        const b = Buffer.from(expected, 'hex');
        if (a.length !== b.length || a.length === 0) return null;
        if (crypto.timingSafeEqual(a, b)) return rawId;
    } catch (e) {}
    return null;
}

module.exports = { authenticateToken, checkOwnership, generateToken, JWT_SECRET, issueVisitorId, verifyVisitorId };
