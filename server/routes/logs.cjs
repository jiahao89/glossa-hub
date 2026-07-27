const express = require('express');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

// GET /api/logs - 获取修改日志
router.get('/', authenticateToken, async (_req, res) => {
  const dbType = getDbType();
  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const rows = await db.query(
      `SELECT l.*, u.name AS operator_name FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY l.id DESC`
    );

    const formatted = rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      kw: r.kw,
      chinese: r.chinese,
      action: r.action,
      details: r.details,
      version: r.version_name,
      operator: r.operator_name || '王赵云'
    }));

    res.json(formatted);
  } catch (err) {
    console.error('读取修改记录日志失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/logs - 记录新的修改日志
router.post('/', authenticateToken, async (req, res) => {
  const { kw, chinese, action, details, version } = req.body;
  const dbType = getDbType();

  if (!action) {
    return res.status(400).json({ error: '必须包含 action 动作说明！' });
  }

  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nowStr, kw || '', chinese || '', action, details || '', version || '', req.user.id]
    );

    res.status(201).json({
      timestamp: nowStr,
      kw,
      chinese,
      action,
      details,
      version,
      operator: req.user.name
    });
  } catch (err) {
    console.error('记录日志失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// DELETE /api/logs - 清空日志
router.delete('/', authenticateToken, async (_req, res) => {
  const dbType = getDbType();
  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    await db.run(`DELETE FROM ${logsTable}`);
    res.json({ message: '修改记录清空成功' });
  } catch (err) {
    console.error('清空日志失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
