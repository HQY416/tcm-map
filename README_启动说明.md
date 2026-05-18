# 🚀 中医药文化传播地图 - 启动与部署说明

## 📁 项目文件结构

```
d:\AI+中医药文化传播\123\
├── 📄 index.html                          # 前端地图展示页面（静态）
├── 📄 tech-map.html                       # 科技风格地图演示
├── 📁 admin/
│   └── 📄 index.html                      # Vue管理后台页面
├── 📁 server/
│   ├── 📄 app.js                          # Express主服务文件
│   ├── 📄 init-db.js                      # SQLite数据库初始化
│   ├── 📁 data/
│   │   └── 📄 herbmap.db                  # SQLite数据文件（自动生成）
│   ├── 📁 models/
│   │   └── 📄 index.js                    # 数据模型
│   ├── 📁 middleware/
│   │   └── 📄 auth.js                     # JWT认证中间件
│   ├── 📁 routes/
│   │   ├── 📄 auth.js                     # 认证路由
│   │   ├── 📄 herbs.js                    # 药材API路由
│   │   ├── 📄 recipes.js                  # 食谱API路由
│   │   └── 📄 videos.js                   # 视频API路由
│   └── 📁 uploads/                        # 视频上传目录（自动生成）
├── 📄 package.json                         # npm依赖配置
├── 📄 PRD-道地药材中华瑰宝-中医药交互式地图App-V1.0.md
└── 📄 UI设计规范提示词-道地药材中华瑰宝.md
```

---

## 🔧 环境依赖检查

### 1. 检查Node.js是否安装

```bash
node --version
npm --version
```

✅ 要求：Node.js >= 14.x

---

## 📦 依赖安装与启动步骤

### 第一步：安装npm依赖包

在项目目录下（`d:\AI+中医药文化传播\123\`）打开PowerShell或CMD，执行：

```powershell
# 切换到项目目录
cd d:\AI+中医药文化传播\123

# 安装项目依赖（仅首次执行）
npm install
```

### 第二步：启动服务

```powershell
# 启动Express服务
npm start

# 或开发模式（自动重启）
# npm install -g nodemon
# npm run dev
```

### 第三步：访问应用

服务启动后，可通过以下地址访问：

| 应用 | 地址 | 默认账号 |
|------|------|----------|
| 🌿 地图前端静态页 | http://localhost:3000/index.html | - |
| 🔧 管理后台 | http://localhost:3000/admin | **admin / admin123** 或 **editor / editor123** |
| 📡 API健康检查 | http://localhost:3000/api/health | - |

---

## 👥 默认账号说明

| 角色 | 用户名 | 密码 | 权限说明 |
|------|--------|------|----------|
| 超级管理员 | `admin` | `admin123` | 可编辑/删除所有内容 |
| 普通编辑 | `editor` | `editor123` | 仅可操作本人创建内容 |

---

## ✨ 功能清单

### 已完成功能

- ✅ **地图展示前端**：全国→省→市→药材四级浏览
- ✅ **后台登录系统**：JWT Token认证 + 权限控制
- ✅ **药材管理**：CRUD + 搜索API
- ✅ **食谱编辑器**：Quill富文本 + 草稿/发布状态
- ✅ **视频上传**：多格式支持 + 药材关联 + 进度条
- ✅ **权限机制**：editor只能删改本人内容，admin可操作全部

### API接口清单

```
POST   /api/auth/login          # 登录获取Token
GET    /api/herbs               # 药材列表
GET    /api/herbs/search        # 药材搜索（?keyword=）
POST   /api/herbs               # 新增药材
PUT    /api/herbs/:id           # 编辑药材
DELETE /api/herbs/:id           # 删除药材
GET    /api/recipes             # 食谱列表
POST   /api/recipes             # 新增食谱
PUT    /api/recipes/:id         # 编辑食谱
DELETE /api/recipes/:id         # 删除食谱
POST   /api/videos/upload       # 视频上传（multipart/form-data）
GET    /api/videos/herb/:herbId # 获取某药材关联视频
POST   /api/videos/relate       # 视频关联药材
```

---

## 🐛 常见问题排查

### Q1: 启动报错 `Error: Cannot find module '...'`
**A：需要先安装依赖包**
```powershell
npm install
```

---

### Q2: 端口3000被占用？
**A：修改`server/app.js`文件末尾的端口号，或先关闭占用程序**

```powershell
# 查看占用
netstat -ano | findstr :3000

# taskkill /pid 进程ID /f
```

---

### Q3: 管理后台登录失败？
**A：检查SQLite库是否正常初始化**，再确认账号密码：
- admin/admin123
- editor/editor123

---

### Q4: 视频上传失败？
检查两点：
1. 视频文件超过500MB限制
2. `server/uploads`目录权限是否正常

---

## 📊 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端静态页 | 原生HTML/CSS/JS |
| 管理后台 | Vue 3 + Quill富文本 |
| 后端框架 | Express 4.x |
| 数据库 | SQLite3（无需额外服务） |
| 鉴权 | JWT (jsonwebtoken) |
| 文件上传 | multer |
| 密码加密 | bcryptjs |

---

**祝您使用愉快！** 🌿
