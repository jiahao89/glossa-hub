const express = require('express');
const router = express.Router();
const { getDbType, getDbInitError, getPgError, getPgDebug } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

router.get('/health', (_req, res) => {
  const dbInitError = getDbInitError();
  const pgErr = getPgError();
  // 错误详情只写服务端日志, 不向无鉴权的探针暴露 (可能含主机/账号片段)
  if (dbInitError || pgErr) {
    console.error('🩺 健康检查发现数据库异常:', dbInitError ? dbInitError.message : '', pgErr || '');
  }
  res.json({
    status: dbInitError ? 'db_error' : 'ok',
    dbType: getDbType(),
    timestamp: new Date().toISOString()
  });
});

router.get('/debug-status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json({
    dbType: getDbType(),
    port: process.env.PORT || 3001,
    hasPgUrl: !!process.env.DATABASE_URL,
    pgError: getPgError(),
    pgDebug: getPgDebug()
  });
});

module.exports = router;
