const express = require('express');
const router = express.Router();
const { getDbType, getDbInitError, getPgError, getPgDebug } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

router.get('/health', (_req, res) => {
  const dbInitError = getDbInitError();
  res.json({
    status: dbInitError ? 'db_error' : 'ok',
    dbType: getDbType(),
    dbInitError: dbInitError ? dbInitError.message : null,
    pgError: getPgError(),
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
