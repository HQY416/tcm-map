const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { generateToken } = require('../middleware/auth');
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

router.post('/change-password', (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    User.findByUsername(username, (err, user) => {
        if (err || !user) {
            return res.json({ success: false, message: '用户不存在' });
        }

        bcrypt.compare(oldPassword, user.password, (err, isMatch) => {
            if (!isMatch) {
                return res.json({ success: false, message: '原密码错误' });
            }

            const salt = bcrypt.genSaltSync(10);
            const newHash = bcrypt.hashSync(newPassword, salt);

            const sqlite3 = require('sqlite3').verbose();
            const db = new sqlite3.Database('./server/data/herbmap.db');
            db.run('UPDATE users SET password = ? WHERE username = ?', [newHash, username], function(err) {
                if (err) {
                    res.json({ success: false, message: err.message });
                } else {
                    res.json({ success: true, message: '密码修改成功' });
                }
            });
        });
    });
});

module.exports = router;
