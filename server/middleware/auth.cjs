const jwt = require('jsonwebtoken');
const { db } = require('../config/db.cjs');

const JWT_SECRET = process.env.JWT_SECRET;
// Vercel Serverless 环境下 NODE_ENV=production 但 JWT_SECRET 仅在 Render 部署设置。
// 为避免冷启动时 process.exit(1) 导致 FUNCTION_INVOCATION_FAILED,
// 改为降级到开发密钥并打印警告——安全性由 Render 端环境变量保证,
// Vercel serverless 只是反向代理层(无持久状态、无用户登录入口)。
if (!JWT_SECRET) {
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const severity = (process.env.NODE_ENV === 'production' && !isVercel) ? 'error' : 'warn';
  console[severity]('⚠️ 未设置 JWT_SECRET 环境变量！当前使用开发专用后备密钥。生产环境(Render)必须配置 JWT_SECRET,否则 Token 可被伪造！');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'glossahub-dev-secret-do-not-use-in-prod';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录或登录已过期，请重新登录。' });
  }

  jwt.verify(token, EFFECTIVE_JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: '无访问权限或登录已过期，请重新登录。' });
    }
    req.user = user;
    next();
  });
}

// Project membership authorization middleware
async function requireProjectMember(req, res, next) {
  const projectId = req.params.projectId || 'proj-default';
  if (req.user?.role === 'admin') {
    req.projectRole = 'owner';
    return next();
  }
  try {
    const member = await db.queryOne(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (!member) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权访问此项目。' });
    }
    req.projectRole = member.role;
    next();
  } catch (err) {
    console.error('RBAC 校验失败:', err.message);
    return res.status(500).json({ error: '权限校验失败，请稍后重试。' });
  }
}

// System Admin authorization middleware
function requireSystemAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '需要超级管理员权限。' });
  }
  next();
}

// Fine-grained RBAC requireRole middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.projectRole) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: '您的角色权限不足以执行此操作。'
      });
    }
    next();
  };
}

async function requireVersionOwnership(userId, versionId) {
  const user = await db.queryOne('SELECT role FROM users WHERE id = $1', [userId]);
  if (user && user.role === 'admin') return true;
  const ver = await db.queryOne(
    'SELECT v.project_id FROM versions v JOIN project_members pm ON v.project_id = pm.project_id WHERE v.id = $1 AND pm.user_id = $2',
    [versionId, userId]
  );
  return !!ver;
}

async function requireTermOwnership(userId, termId) {
  const user = await db.queryOne('SELECT role FROM users WHERE id = $1', [userId]);
  if (user && user.role === 'admin') return true;
  const term = await db.queryOne(
    `SELECT t.version_id FROM terms t
     JOIN versions v ON t.version_id = v.id
     JOIN project_members pm ON v.project_id = pm.project_id
     WHERE t.id = $1 AND pm.user_id = $2`,
    [termId, userId]
  );
  return !!term;
}

function signUserToken(userPayload) {
  return jwt.sign(userPayload, EFFECTIVE_JWT_SECRET, { expiresIn: '7d' });
}

module.exports = {
  authenticateToken,
  requireProjectMember,
  requireSystemAdmin,
  requireRole,
  requireVersionOwnership,
  requireTermOwnership,
  signUserToken,
  EFFECTIVE_JWT_SECRET
};
