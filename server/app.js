const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

var staticRoot = isVercel ? path.join(process.cwd()) : path.join(__dirname, '..');

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: function(res, filePath) {
        var ext = path.extname(filePath).toLowerCase();
        var mimeTypes = {
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

app.use('/api/auth', authRoutes);
app.use('/api/herbs', herbRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/quiz', quizRoutes);

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: '中医药文化传播地图 API 服务正常',
        timestamp: new Date().toISOString(),
        vercel: isVercel
    });
});

app.get('/api/debug/images', (req, res) => {
    var uploadsDir = path.join(__dirname, 'uploads', 'herbs');
    var result = { uploadsDir: uploadsDir, dirExists: false, files: [], dbImages: [] };
    try {
        result.dirExists = fs.existsSync(uploadsDir);
        if (result.dirExists) {
            result.files = fs.readdirSync(uploadsDir).filter(function(f) {
                var ext = path.extname(f).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].indexOf(ext) > -1;
            });
        }
    } catch (e) {
        result.error = e.message;
    }
    try {
        var db = require('./init-db');
        db.all('SELECT id, name, image_url FROM herbs WHERE image_url IS NOT NULL', function(err, rows) {
            if (!err && rows) {
                result.dbImages = rows.map(function(r) {
                    var url = r.image_url || '';
                    var relativePath = url.replace(/^\/+/, '');
                    var filePath = path.join(__dirname, relativePath);
                    var fileExists = false;
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
