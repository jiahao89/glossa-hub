const { db, getDbType } = require('../config/db.cjs');

/**
 * 记录审计修改日志 (统一支持 PostgreSQL 和 SQLite)
 * @param {object} options
 * @param {string} [options.kw] - 词条 KW 键名
 * @param {string} [options.chinese] - 中文源文本
 * @param {string} options.action - 动作说明（如：修改词条、新增词条、批量新增、批量翻译、历史回退、批量删除等）
 * @param {string} [options.details] - 详情（支持字符串或 JSON 格式）
 * @param {string} [options.versionName] - 所属大表版本名称
 * @param {string} [options.userId] - 操作人 User ID
 * @param {object} [options.tx] - 可选的事务上下文
 */
async function createAuditLog({ kw = '', chinese = '', action, details = '', versionName = '', userId = null, tx = null }) {
  if (!action) return;
  const runner = tx || db;
  const dbType = getDbType();
  const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
  const nowIso = new Date().toISOString();

  // Normalize kw if empty placeholder
  const cleanKw = (kw && kw.startsWith('__EMPTY_KW_')) ? '' : (kw || '');

  try {
    if (dbType === 'postgres') {
      await runner.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
        [cleanKw, chinese || '', action, details || '', versionName || '', userId]
      );
    } else {
      await runner.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [nowIso, cleanKw, chinese || '', action, details || '', versionName || '', userId]
      );
    }
  } catch (err) {
    console.error('[createAuditLog] 记录日志异常:', err.message);
  }
}

module.exports = { createAuditLog };
