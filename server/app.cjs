require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { ensureDbInit, shutdownDatabase, getDbType } = require('./config/db.cjs');

const healthRoutes = require('./routes/health.cjs');
const authRoutes = require('./routes/auth.cjs');
const adminRoutes = require('./routes/admin.cjs');
const versionRoutes = require('./routes/versions.cjs');
const termRoutes = require('./routes/terms.cjs');
const syncRoutes = require('./routes/sync.cjs');
const glossaryRoutes = require('./routes/glossary.cjs');
const languageRoutes = require('./routes/languages.cjs');
const translationRoutes = require('./routes/translation.cjs');
const dashboardRoutes = require('./routes/dashboard.cjs');
const recycleBinRoutes = require('./routes/recycleBin.cjs');
const logRoutes = require('./routes/logs.cjs');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// 启动日志:便于确认 Render 部署的代码版本
const { execSync } = require('child_process');
let gitCommit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown';
if (gitCommit === 'unknown') {
  try { gitCommit = execSync('git rev-parse --short HEAD', { cwd: __dirname + '/..' }).toString().trim(); } catch {}
}
console.log(`🚀 GlossaHub backend starting | commit=${gitCommit} | port=${PORT} | node=${process.version}`);

// CORS 配置：支持跨域白名单（从环境变量读取，默认开发与 vercel.app 动态匹配）
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('CORS 策略已拦截未授权的来源: ' + origin));
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 挂载 /api/health （置于 DB 初始化中间件之前，方便探针无视 DB 状态获取健康指标）
app.use('/api', healthRoutes);

// DB 异步连通初始化守卫中间件
app.use(async (_req, res, next) => {
  try {
    await ensureDbInit();
    next();
  } catch (err) {
    // 注意: 不要把 err.message 暴露给客户端 — PG/驱动错误常包含主机/端口/账号片段,
    // 容易成为凭证枚举的入口。详细堆栈只写服务端日志。
    console.error('❌ DB 初始化异常:', err);
    res.status(500).json({ error: '数据库初始化失败，请联系管理员。' });
  }
});

// 挂载业务路由
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', versionRoutes);
app.use('/api', termRoutes);
app.use('/api', syncRoutes);
app.use('/api', glossaryRoutes);
app.use('/api', languageRoutes);
app.use('/api', translationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', recycleBinRoutes);
app.use('/api/logs', logRoutes);

// Start Server (only when NOT running in Vercel Serverless Environment)
let server = null;
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  ensureDbInit().then(() => {
    server = app.listen(PORT, () => {
      console.log(`🌐 GlossaHub 协同数据日志服务已启动，监听端口: ${PORT}`);
      console.log(`📡 数据库引擎: [${getDbType().toUpperCase()}]`);
    });
  }).catch(err => {
    console.error('❌ 服务器启动时初始化数据库失败:', err.message);
  });
}

// 优雅关机 (Graceful Shutdown)
const shutdown = async () => {
  console.log('\n📡 正在接收到关闭信号，开始优雅关闭 GlossaHub 后端服务...');
  if (server) {
    server.close(() => {
      console.log('🌐 Express Web 服务已停止接收新连接。');
    });
  }

  await shutdownDatabase();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
