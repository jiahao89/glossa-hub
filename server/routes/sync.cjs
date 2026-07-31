const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireVersionOwnership } = require('../middleware/auth.cjs');
const { heavyOperationLimiter } = require('../middleware/rateLimiters.cjs');
const { TARGET_LANGUAGES, LEGACY_TO_NEW_LANG_MAP } = require('../config/constants.cjs');

// POST /api/sync-table - 批量同步词条数据
router.post('/sync-table', authenticateToken, heavyOperationLimiter, async (req, res) => {
  const { tableId, tableName, records } = req.body;
  const dbType = getDbType();

  if (!tableId || !tableName || !Array.isArray(records)) {
    return res.status(400).json({ error: '必须包含 tableId, tableName 和 records 数组！' });
  }

  try {
    const version = await db.queryOne('SELECT project_id FROM versions WHERE id = $1', [tableId]);
    const projectId = version ? version.project_id : 'proj-default';
    const member = await db.queryOne(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );

    if (member && member.role === 'viewer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '只读审核人员无权导入或修改词条。' });
    }
    if (!member && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权操作此数据表。' });
    }
    const existingVersion = await db.queryOne('SELECT id FROM versions WHERE id = $1', [tableId]);
    if (!existingVersion) {
      if (dbType === 'postgres') {
        await db.run(
          'INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (project_id, version_name) DO NOTHING',
          [tableId, 'proj-default', tableName]
        );
      } else {
        await db.run(
          "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, $2, $3, datetime('now'))",
          [tableId, 'proj-default', tableName]
        );
      }
    }



    const recordIds = records.map(r => r.recordId).filter(Boolean);
    const lockedFalse = dbType === 'postgres' ? 'FALSE' : '0';

    await db.transaction(async (tx) => {
      if (records.length > 0) {
        const existingTerms = await tx.query(
          `SELECT id FROM terms WHERE version_id = $1 AND (is_locked = ${lockedFalse} OR is_locked IS NULL)`,
          [tableId]
        );
        const existingIds = existingTerms.map(t => t.id);
        const idsToDelete = existingIds.filter(id => !recordIds.includes(id));

        const chunkSize = 500;
        for (let i = 0; i < idsToDelete.length; i += chunkSize) {
          const chunk = idsToDelete.slice(i, i + chunkSize);
          const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(',');
          await tx.run(
            `DELETE FROM terms WHERE version_id = $1 AND id IN (${placeholders})`,
            [tableId, ...chunk]
          );
        }
      } else if (records.length === 0) {
        const existing = await tx.queryOne(
          'SELECT COUNT(*) as cnt FROM terms WHERE version_id = $1', [tableId]
        );
        const existingCount = existing ? (existing.cnt || 0) : 0;
        if (existingCount > 0) {
          throw new Error(`安全拦截: 试图对含有 ${existingCount} 条词条的版本执行空数组全量清除！请检查前端数据完整性。`);
        }
        await tx.run('DELETE FROM terms WHERE version_id = $1', [tableId]);
      }

      const fuzzyGetFieldValue = (fields, exactMatches, fuzzyKeywords) => {
        for (const match of exactMatches) {
          if (fields[match] !== undefined) return fields[match];
        }
        const keys = Object.keys(fields);
        for (const k of keys) {
          const lowerK = k.toLowerCase();
          if (fuzzyKeywords.some(kw => lowerK.includes(kw.toLowerCase()))) {
            return fields[k];
          }
        }
        return '';
      };

      if (dbType === 'postgres') {
        if (records.length > 0) {
          const CHUNK_SIZE = 500;
          for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunkRecords = records.slice(i, i + CHUNK_SIZE);
            const values = [];
            const valuePlaceholders = [];
            let paramIdx = 1;

            for (const rec of chunkRecords) {
              const fields = rec.fields || {};
              let kw = fuzzyGetFieldValue(fields, ['KW', 'Key'], ['kw', 'key']);
              if (typeof kw === 'string') kw = kw.trim();
              if (!kw) {
                kw = `__EMPTY_KW_${crypto.randomUUID()}__`;
              }
              const zh_cn = fuzzyGetFieldValue(fields, ['CN（中文）', '中文', 'Source'], ['中文', 'cn', 'source']);
              const context = fuzzyGetFieldValue(fields, ['所在页面', '词条所在界面（注意是界面不是模块！！）'], ['页面', '界面', 'page', 'context']);
              const owner = fuzzyGetFieldValue(fields, ['字号类别', '负责人'], ['字号', '负责人', 'owner']);

              const rawTranslations = {};
              TARGET_LANGUAGES.forEach(lang => {
                let fuzzyKeywords = [lang.toLowerCase()];
                const match = lang.match(/([a-zA-Z]+)[（(](.+)[)）]/);
                if (match) {
                  fuzzyKeywords = [match[1].toLowerCase(), match[2].toLowerCase()];
                } else {
                  const letters = lang.match(/[a-zA-Z]+/);
                  const chars = lang.match(/[\u4e00-\u9fa5]+/);
                  if (letters) fuzzyKeywords.push(letters[0].toLowerCase());
                  if (chars) fuzzyKeywords.push(chars[0]);
                }
                const val = fuzzyGetFieldValue(fields, [lang], fuzzyKeywords);
                if (val !== '') {
                  rawTranslations[lang] = val;
                }
              });
              Object.keys(LEGACY_TO_NEW_LANG_MAP).forEach(legacyKey => {
                if (fields[legacyKey] !== undefined) rawTranslations[legacyKey] = fields[legacyKey];
              });

              const normalizedTrans = {};
              for (const [key, val] of Object.entries(rawTranslations)) {
                if (TARGET_LANGUAGES.includes(key)) {
                  normalizedTrans[key] = val;
                } else if (LEGACY_TO_NEW_LANG_MAP[key]) {
                  normalizedTrans[LEGACY_TO_NEW_LANG_MAP[key]] = val;
                } else {
                  normalizedTrans[key] = val;
                }
              }

              const translationsStr = JSON.stringify(normalizedTrans);
              const termId = rec.recordId || crypto.randomUUID();
              const transMetaStr = rec.translationsMeta ? JSON.stringify(rec.translationsMeta) : '{}';

              valuePlaceholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}::jsonb, $${paramIdx + 7}::jsonb, $${paramIdx + 8}, NOW())`);
              values.push(termId, tableId, kw, context, owner, zh_cn, translationsStr, transMetaStr, req.user.id);
              paramIdx += 9;
            }

            if (values.length > 0) {
              const sql = `
                INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_by, updated_at)
                VALUES ${valuePlaceholders.join(',\n')}
                ON CONFLICT (id) DO UPDATE SET
                  kw = EXCLUDED.kw,
                  context = EXCLUDED.context,
                  owner = EXCLUDED.owner,
                  zh_cn = EXCLUDED.zh_cn,
                  translations = EXCLUDED.translations,
                  translations_meta = COALESCE(NULLIF(EXCLUDED.translations_meta, '{}'::jsonb), terms.translations_meta),
                  updated_at = NOW(),
                  updated_by = EXCLUDED.updated_by
                WHERE terms.is_locked = FALSE OR terms.is_locked IS NULL
              `;
              await tx.run(sql, values);
            }
          }
        }
      } else {
        if (records.length > 0) {
          const termIds = records.map(r => r.recordId).filter(Boolean);
          const lockedTermIds = new Set();
          const existingMetaMap = new Map();

          if (termIds.length > 0) {
            const CHUNK_SIZE = 500;
            for (let i = 0; i < termIds.length; i += CHUNK_SIZE) {
              const chunk = termIds.slice(i, i + CHUNK_SIZE);
              const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');
              const rows = await tx.query(`SELECT id, is_locked, translations_meta FROM terms WHERE id IN (${placeholders})`, chunk);
              rows.forEach(r => {
                if (r.is_locked === 1 || r.is_locked === true) lockedTermIds.add(r.id);
                if (r.translations_meta && r.translations_meta !== '{}') existingMetaMap.set(r.id, r.translations_meta);
              });
            }
          }

          for (const rec of records) {
            const fields = rec.fields || {};
            let kw = fuzzyGetFieldValue(fields, ['KW', 'Key'], ['kw', 'key']);
            if (typeof kw === 'string') kw = kw.trim();
            if (!kw) {
              kw = `__EMPTY_KW_${crypto.randomUUID()}__`;
            }
            const zh_cn = fuzzyGetFieldValue(fields, ['CN（中文）', '中文', 'Source'], ['中文', 'cn', 'source']);
            const context = fuzzyGetFieldValue(fields, ['所在页面', '词条所在界面（注意是界面不是模块！！）'], ['页面', '界面', 'page', 'context']);
            const owner = fuzzyGetFieldValue(fields, ['字号类别', '负责人'], ['字号', '负责人', 'owner']);

            const rawTranslations = {};
            TARGET_LANGUAGES.forEach(lang => {
              let fuzzyKeywords = [lang.toLowerCase()];
              const match = lang.match(/([a-zA-Z]+)[（(](.+)[)）]/);
              if (match) {
                fuzzyKeywords = [match[1].toLowerCase(), match[2].toLowerCase()];
              } else {
                const letters = lang.match(/[a-zA-Z]+/);
                const chars = lang.match(/[\u4e00-\u9fa5]+/);
                if (letters) fuzzyKeywords.push(letters[0].toLowerCase());
                if (chars) fuzzyKeywords.push(chars[0]);
              }
              const val = fuzzyGetFieldValue(fields, [lang], fuzzyKeywords);
              if (val !== '') {
                rawTranslations[lang] = val;
              }
            });
            Object.keys(LEGACY_TO_NEW_LANG_MAP).forEach(legacyKey => {
              if (fields[legacyKey] !== undefined) rawTranslations[legacyKey] = fields[legacyKey];
            });

            const normalizedTrans = {};
            for (const [key, val] of Object.entries(rawTranslations)) {
              if (TARGET_LANGUAGES.includes(key)) {
                normalizedTrans[key] = val;
              } else if (LEGACY_TO_NEW_LANG_MAP[key]) {
                normalizedTrans[LEGACY_TO_NEW_LANG_MAP[key]] = val;
              } else {
                normalizedTrans[key] = val;
              }
            }

            const translationsStr = JSON.stringify(normalizedTrans);
            const termId = rec.recordId || crypto.randomUUID();

            if (lockedTermIds.has(termId)) continue;

            const transMetaStr = rec.translationsMeta ? JSON.stringify(rec.translationsMeta) : '{}';
            let finalMetaStr = transMetaStr;
            if (transMetaStr === '{}' && existingMetaMap.has(termId)) {
              finalMetaStr = existingMetaMap.get(termId);
            }

            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_by, updated_at, is_locked, locked_by, locked_at, status, reject_reason)
               VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),0,NULL,NULL,'DRAFT',NULL)
               ON CONFLICT(id) DO UPDATE SET
                 kw=excluded.kw, context=excluded.context, owner=excluded.owner, zh_cn=excluded.zh_cn,
                 translations=excluded.translations, translations_meta=excluded.translations_meta,
                 updated_by=excluded.updated_by, updated_at=datetime('now')
               WHERE (is_locked IS NOT TRUE)`,
              [termId, tableId, kw, context, owner, zh_cn, translationsStr, finalMetaStr, req.user.id]
            );
          }
        }
      }
    });

    res.json({ message: `同步成功！共同步 ${records.length} 条词条。` });
  } catch (err) {
    console.error('数据同步处理失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/versions/sync-terms - 版本对比一键同步合并
router.post('/versions/sync-terms', authenticateToken, heavyOperationLimiter, async (req, res) => {
  const { sourceVersionId, targetVersionId, syncActions } = req.body;
  const dbType = getDbType();

  if (!sourceVersionId || !targetVersionId || !Array.isArray(syncActions)) {
    return res.status(400).json({ error: '必须包含 sourceVersionId, targetVersionId 和 syncActions 数组！' });
  }

  try {
    const targetVerMembership = await db.queryOne(
      'SELECT pm.role FROM versions v JOIN project_members pm ON v.project_id = pm.project_id WHERE v.id = $1 AND pm.user_id = $2',
      [targetVersionId, req.user.id]
    );
    if (targetVerMembership && targetVerMembership.role === 'viewer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '只读审核人员无权合并同步词条。' });
    }
    if (!(await requireVersionOwnership(req.user.id, sourceVersionId)) || !(await requireVersionOwnership(req.user.id, targetVersionId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权操作此数据表。' });
    }
    const sourceVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [sourceVersionId]);
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [targetVersionId]);
    if (!sourceVer || !targetVer) {
      return res.status(404).json({ error: '指定的源版本或目标版本不存在！' });
    }

    const sourceName = sourceVer.version_name;
    const targetName = targetVer.version_name;

    let addCount = 0;
    let modCount = 0;
    let delCount = 0;

    await db.transaction(async (tx) => {
      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';

      for (const action of syncActions) {
        const { type, kw, data } = action;
        if (!kw) continue;

        await tx.run('DELETE FROM terms WHERE version_id = $1 AND kw = $2', [targetVersionId, kw]);

        if (type === 'ADD' || type === 'MOD') {
          if (type === 'ADD') addCount++;
          if (type === 'MOD') modCount++;

          const termId = crypto.randomUUID();
          const context = data.context || '';
          const owner = data.owner || '';
          const zhCn = data.zh_cn || '';
          const transStr = typeof data.translations === 'object' ? JSON.stringify(data.translations) : (data.translations || '{}');

          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), NOW())`,
              [termId, targetVersionId, kw, context, owner, zhCn, transStr, req.user.id]
            );
          } else {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, updated_by, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), datetime('now'))`,
              [termId, targetVersionId, kw, context, owner, zhCn, transStr, req.user.id]
            );
          }
        } else if (type === 'DEL') {
          delCount++;
        }
      }

      const details = `从版本 [${sourceName}] 同步合并变更到版本 [${targetName}]。新增: ${addCount} 条, 修改: ${modCount} 条, 删除: ${delCount} 条。`;
      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
          [`SYNC_MERGE_${addCount + modCount + delCount}`, '批量同步合并', '同步合并', details, targetName, req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (datetime('now'), $1, $2, $3, $4, $5, $6)`,
          [`SYNC_MERGE_${addCount + modCount + delCount}`, '批量同步合并', '同步合并', details, targetName, req.user.id]
        );
      }
    });

    res.json({
      message: `成功同步合并到 [${targetName}]！`,
      added: addCount,
      modified: modCount,
      deleted: delCount
    });

  } catch (err) {
    console.error('版本合并同步失败:', err);
    res.status(500).json({ error: '合并同步处理中发生服务器内部错误。' });
  }
});

// POST /api/sync-cleanup - 缓存清理
router.post('/sync-cleanup', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '仅管理员可执行缓存清理。' });
  }
  const { activeTableIds } = req.body;
  if (!Array.isArray(activeTableIds)) {
    return res.status(400).json({ error: '必须包含 activeTableIds 数组！' });
  }

  try {
    if (activeTableIds.length === 0) {
      await db.run('DELETE FROM terms');
      await db.run('DELETE FROM versions');
      res.json({ message: '缓存已清空' });
    } else {
      const placeholders = activeTableIds.map((_, idx) => `$${idx + 1}`).join(',');
      await db.run(`DELETE FROM terms WHERE version_id NOT IN (${placeholders})`, activeTableIds);
      await db.run(`DELETE FROM versions WHERE id NOT IN (${placeholders})`, activeTableIds);
      res.json({ message: '缓存清理成功' });
    }
  } catch (err) {
    console.error('清理缓存失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
