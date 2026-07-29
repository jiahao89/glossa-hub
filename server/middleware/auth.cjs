const jwt = require('jsonwebtoken');
const { db } = require('../config/db.cjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 致命错误: 生产环境必须设置 JWT_SECRET 环境变量！拒绝启动以防止 Token 伪造风险。');
    process.exit(1);
  }
  console.warn('⚠️ 警告: 未设置 JWT_SECRET，当前使用开发专用后备密钥。切勿在生产环境中使用！');
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
