const express = require('express');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

// GET /api/logs - 获取修改日志（分页 + 服务端筛选）
router.get('/', authenticateToken, async (req, res) => {
  const dbType = getDbType();
  const {
    page = '1',
    pageSize = '50',
    search = '',
    version = '',
    operator = '',
    action = '',
    startDate = '',
    endDate = ''
  } = req.query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const size = Math.min(200, Math.max(1, parseInt(pageSize) || 50));
  const offset = (pageNum - 1) * size;

  try {
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';

    // Build WHERE clause
    let whereClause = ' WHERE 1=1';
    const params = [];
    let pi = 1; // paramIndex

    if (search) {
      if (dbType === 'sqlite') {
        const p1 = pi, p2 = pi + 1, p3 = pi + 2, p4 = pi + 3;
        const pattern = `%${search}%`;
        whereClause += ` AND (l.kw LIKE $${p1} OR l.chinese LIKE $${p2} OR l.details LIKE $${p3} OR u.name LIKE $${p4})`;
        params.push(pattern, pattern, pattern, pattern);
        pi += 4;
      } else {
        whereClause += ` AND (l.kw ILIKE $${pi} OR l.chinese ILIKE $${pi} OR l.details ILIKE $${pi} OR u.name ILIKE $${pi})`;
        params.push(`%${search}%`);
        pi++;
      }
    }

    if (version) {
      whereClause += ` AND l.version_name = $${pi}`;
      params.push(version);
      pi++;
    }

    if (operator) {
      whereClause += ` AND u.name = $${pi}`;
      params.push(operator);
      pi++;
    }

    if (action) {
      whereClause += ` AND l.action = $${pi}`;
      params.push(action);
      pi++;
    }

    if (startDate) {
      const startVal = startDate.includes('T') || startDate.includes(' ') ? startDate : `${startDate} 00:00:00`;
      whereClause += ` AND (l.timestamp >= $${pi} OR l.timestamp >= $${pi + 1})`;
      params.push(startVal, `${startDate}T00:00:00`);
      pi += 2;
    }

    if (endDate) {
      const endVal = endDate.includes('T') || endDate.includes(' ') ? endDate : `${endDate} 23:59:59`;
      whereClause += ` AND (l.timestamp <= $${pi} OR l.timestamp <= $${pi + 1})`;
      params.push(endVal, `${endDate}T23:59:59.999Z`);
      pi += 2;
    }

    // Paginated query
    const rows = await db.query(
      `SELECT l.*, u.name AS operator_name FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ${whereClause}
       ORDER BY l.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, size, offset]
    );

    // Count query (reuse WHERE + params, no LIMIT/OFFSET)
    const countRows = await db.query(
      `SELECT COUNT(*) as total FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Filter options (full list, independent of pagination/filters)
    const versionRows = await db.query(
      `SELECT DISTINCT l.version_name FROM ${logsTable} l WHERE l.version_name IS NOT NULL AND l.version_name != '' ORDER BY l.version_name`
    );
    const operatorRows = await db.query(
      `SELECT DISTINCT u.name FROM ${logsTable} l LEFT JOIN users u ON l.user_id = u.id WHERE u.name IS NOT NULL AND u.name != '' ORDER BY u.name`
    );
    const actionRows = await db.query(
      `SELECT DISTINCT l.action FROM ${logsTable} l WHERE l.action IS NOT NULL AND l.action != '' ORDER BY l.action`
    );

    const formatted = rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      kw: r.kw,
      chinese: r.chinese,
      action: r.action,
      details: r.details,
      version: r.version_name,
      operator: r.operator_name || '系统'
    }));

    res.json({
      logs: formatted,
      total,
      page: pageNum,
      pageSize: size,
      filters: {
        versions: versionRows.map(r => r.version_name).filter(Boolean),
        operators: operatorRows.map(r => r.name).filter(Boolean),
        actions: actionRows.map(r => r.action).filter(Boolean)
      }
    });
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
