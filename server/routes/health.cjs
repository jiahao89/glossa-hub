const express = require('express');
const router = express.Router();
const { getDbType, getDbInitError, getPgError, getPgDebug } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

router.get('/health', async (_req, res) => {
  const dbInitError = getDbInitError();
  // 顺手查一下 Render 的出口 IP,用于排查 night.magene.cn 的 403
  let outboundIp = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) {
      const j = await r.json();
      outboundIp = j.ip;
    }
  } catch {}
  res.json({
    status: dbInitError ? 'db_error' : 'ok',
    dbType: getDbType(),
    dbInitError: dbInitError ? dbInitError.message : null,
    pgError: getPgError(),
    outboundIp,  // 调试用:Render 后端对外 IP
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
