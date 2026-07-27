const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

try {
    require('./init-db');
} catch (e) {
    console.error('数据库初始化失败:', e.message);
}

const authRoutes = require('./routes/auth');
const herbRoutes = require('./routes/herbs');
const videoRoutes = require('./routes/videos');
const recipeRoutes = require('./routes/recipes');
const commentRoutes = require('./routes/comments');
const statsRoutes = require('./routes/stats');
const likesRoutes = require('./routes/likes');
const feedbackRoutes = require('./routes/feedback');
const logsRoutes = require('./routes/logs');
const quizRoutes = require('./routes/quiz');
const visitorRoutes = require('./routes/visitor');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// 启用 helmet 安全头(保留默认 CSP 之外的部分,允许内联脚本以兼容单页前端)
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 全局写接口速率限制(防刷评论/反馈/登录等)
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '请求过于频繁,请稍后再试' }
});
// 登录/改密更严格:防暴力破解
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '尝试次数过多,请稍后再试' }
});

const staticRoot = isVercel ? process.cwd() : path.join(__dirname, '..');

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: function(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm'
        };
        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
}));
app.use(express.static(staticRoot));
app.use('/admin', express.static(path.join(staticRoot, 'admin')));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/herbs', herbRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/comments', writeLimiter, commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/feedback', writeLimiter, feedbackRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/visitor', visitorRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: '中医药文化传播地图 API 服务正常',
        timestamp: new Date().toISOString(),
        vercel: isVercel
    });
});

// 修复:debug 接口加管理员鉴权,避免公开泄露服务器文件信息
app.get('/api/debug/images', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '仅管理员可访问' });
    }
    const uploadsDir = path.join(__dirname, 'uploads', 'herbs');
    const result = { uploadsDir: uploadsDir, dirExists: false, files: [], dbImages: [] };
    try {
        result.dirExists = fs.existsSync(uploadsDir);
        if (result.dirExists) {
            result.files = fs.readdirSync(uploadsDir).filter(function(f) {
                const ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].indexOf(ext) > -1;
            });
        }
    } catch (e) {
        result.error = e.message;
    }
    try {
        const db = require('./init-db');
        db.all('SELECT id, name, image_url FROM herbs WHERE image_url IS NOT NULL', function(err, rows) {
            if (!err && rows) {
                result.dbImages = rows.map(function(r) {
                    const url = r.image_url || '';
                    const relativePath = url.replace(/^\/+/, '');
                    const filePath = path.join(__dirname, relativePath);
                    let fileExists = false;
                    try { fileExists = fs.existsSync(filePath); } catch(e) {}
                    return { id: r.id, name: r.name, image_url: url, fileExists: fileExists };
                });
            }
            res.json({ success: true, data: result });
        });
    } catch (e) {
        res.json({ success: true, data: result, dbError: e.message });
    }
});

// 修复:/admin 路由统一由 express.static 处理,这里仅兜底返回 index.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(staticRoot, 'admin', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        message: err.message || '服务器内部错误'
    });
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ success: false, message: '接口不存在' });
    } else if (req.path.startsWith('/admin')) {
        res.sendFile(path.join(staticRoot, 'admin', 'index.html'));
    } else {
        res.sendFile(path.join(staticRoot, 'index.html'));
    }
});

if (!isVercel) {
    function startServer(port) {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`Server started on port ${port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                if (process.env.RENDER) {
                    console.error('Port ' + port + ' in use on Render, cannot increment');
                    process.exit(1);
                }
                console.log(`⚠️  端口 ${port} 被占用，尝试端口 ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('启动失败:', err.message);
            }
        });
    }
    startServer(PORT);
}

module.exports = app;
