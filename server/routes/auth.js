const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../init-db');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { User } = require('../models');
const router = express.Router();

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: '用户名和密码不能为空' });
    }

    User.findByUsername(username, (err, user) => {
        if (err || !user) {
            return res.json({ success: false, message: '用户名或密码错误' });
        }

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.json({ success: false, message: '用户名或密码错误' });
            }

            const token = generateToken(user);
            db.run('INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                [user.id, 'login', 'user', user.id, '用户登录', req.ip]);
            res.json({
                success: true,
                message: '登录成功',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        });
    });
});

router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        }
    });
});

// 修复:修改密码接口必须携带有效 token,防止他人凭已知原密码直接调用
router.post('/change-password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.json({ success: false, message: '请填写完整信息' });
    }

    if (newPassword.length < 6) {
        return res.json({ success: false, message: '新密码长度不能少于6位' });
    }

    bcrypt.compare(currentPassword, req.user.password, (err, isMatch) => {
        if (err || !isMatch) {
            return res.json({ success: false, message: '当前密码错误' });
        }

        bcrypt.hash(newPassword, 10, (err2, hash) => {
            if (err2) {
                return res.json({ success: false, message: '密码加密失败' });
            }
            // 修复:统一使用 models 层 db 实例,避免新建独立连接导致连接泄漏
            db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id], (err3) => {
                if (err3) {
                    return res.json({ success: false, message: '密码更新失败' });
                }
                db.run('INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                    [req.user.id, 'change_password', 'user', req.user.id, '修改密码', req.ip]);
                res.json({ success: true, message: '密码修改成功，请重新登录' });
            });
        });
    });
});

module.exports = router;
