const express = require('express');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireProjectMember, requireRole } = require('../middleware/auth.cjs');

// GET /api/projects/:projectId/recycle-bin - 获取回收站数据列表
router.get('/projects/:projectId/recycle-bin', authenticateToken, requireProjectMember, requireRole(['owner']), async (_req, res) => {
  const dbType = getDbType();
  try {
    const cleanupSql = dbType === 'postgres'
      ? `DELETE FROM recycle_bin WHERE expires_at < NOW()`
      : `DELETE FROM recycle_bin WHERE datetime(expires_at) < datetime('now')`;
    await db.run(cleanupSql);

    const items = await db.query(
      `SELECT r.id, r.entity_type, r.entity_name, r.deleted_at, r.expires_at, u.name AS deleted_by_name
       FROM recycle_bin r
       LEFT JOIN users u ON r.deleted_by = u.id
       ORDER BY r.deleted_at DESC`
    );

    res.json(items);
  } catch (err) {
    console.error('获取回收站数据失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/recycle-bin/:id/restore - 恢复回收站数据
router.post('/recycle-bin/:id/restore', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const dbType = getDbType();
  try {
    const item = await db.queryOne('SELECT * FROM recycle_bin WHERE id = $1', [id]);
    if (!item) {
      return res.status(404).json({ error: '回收站条目未找到' });
    }

    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
    let projectId = '';
    if (item.entity_type === 'version' && payload.version) {
      projectId = payload.version.project_id;
    } else if (item.entity_type === 'glossary_table' && payload.glossary_table) {
      projectId = payload.glossary_table.project_id;
    } else if (item.entity_type === 'language' && payload.language) {
      projectId = payload.language.project_id;
    }

    if (!projectId) {
      return res.status(400).json({ error: '无法解析的项目归属信息，恢复失败。' });
    }

    const member = await db.queryOne(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if ((!member || member.role !== 'owner') && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '只有项目所有者或系统管理员能够执行恢复操作。' });
    }

    await db.transaction(async (tx) => {
      if (item.entity_type === 'version') {
        const { version, terms, snapshots } = payload;
        await tx.run(
          'INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, $4, $5)',
          [version.id, version.project_id, version.version_name, version.created_at, version.created_by]
        );

        for (const term of terms) {
          const lockedVal = dbType === 'postgres' ? (term.is_locked ? true : false) : (term.is_locked ? 1 : 0);
          const translationsStr = typeof term.translations === 'string' ? term.translations : JSON.stringify(term.translations || {});
          const metaStr = typeof term.translations_meta === 'string' ? term.translations_meta : JSON.stringify(term.translations_meta || {});

          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, updated_by, is_locked, locked_by, locked_at, status, reject_reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [term.id, term.version_id, term.kw, term.context, term.owner, term.zh_cn, translationsStr, metaStr, term.created_at, term.updated_at, term.updated_by, lockedVal, term.locked_by, term.locked_at, term.status, term.reject_reason]
            );
          } else {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, updated_by, is_locked, locked_by, locked_at, status, reject_reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [term.id, term.version_id, term.kw, term.context, term.owner, term.zh_cn, translationsStr, metaStr, term.created_at, term.updated_at, term.updated_by, lockedVal, term.locked_by, term.locked_at, term.status, term.reject_reason]
            );
          }
        }

        for (const snap of snapshots) {
          const translationsStr = typeof snap.translations === 'string' ? snap.translations : JSON.stringify(snap.translations || {});
          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
              [snap.id, snap.term_id, snap.version_id, snap.kw, snap.zh_cn, translationsStr, snap.created_at, snap.created_by]
            );
          } else {
            await tx.run(
              `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [snap.id, snap.term_id, snap.version_id, snap.kw, snap.zh_cn, translationsStr, snap.created_at, snap.created_by]
            );
          }
        }
      } else if (item.entity_type === 'glossary_table') {
        const { glossary_table, glossary_terms } = payload;
        const headersStr = typeof glossary_table.headers === 'string' ? glossary_table.headers : JSON.stringify(glossary_table.headers || []);

        await tx.run(
          'INSERT INTO glossary_tables (id, project_id, table_name, created_at, headers) VALUES ($1, $2, $3, $4, $5)',
          [glossary_table.id, glossary_table.project_id, glossary_table.table_name, glossary_table.created_at, headersStr]
        );

        for (const term of glossary_terms) {
          const fieldsStr = typeof term.fields === 'string' ? term.fields : JSON.stringify(term.fields || {});
          if (dbType === 'postgres') {
            await tx.run(
              'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
              [term.id, term.table_id, term.cn_term, term.en_term, term.description, term.created_at, fieldsStr]
            );
          } else {
            await tx.run(
              'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [term.id, term.table_id, term.cn_term, term.en_term, term.description, term.created_at, fieldsStr]
            );
          }
        }
      } else if (item.entity_type === 'language') {
        const { language, term_translations } = payload;

        const existingLang = await tx.queryOne(
          'SELECT id FROM languages WHERE project_id = $1 AND lang_code = $2',
          [language.project_id, language.lang_code]
        );
        if (existingLang) {
          throw new Error(`语种代码 [${language.lang_code}] 已存在，无法恢复！`);
        }

        await tx.run(
          'INSERT INTO languages (id, project_id, lang_code, lang_name, display_order, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [language.id, language.project_id, language.lang_code, language.lang_name, language.display_order, language.created_at]
        );

        const langName = language.lang_name;
        for (const [termId, data] of Object.entries(term_translations)) {
          const term = await tx.queryOne('SELECT translations, translations_meta FROM terms WHERE id = $1', [termId]);
          if (term) {
            const trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
            const meta = typeof term.translations_meta === 'string' ? JSON.parse(term.translations_meta || '{}') : (term.translations_meta || {});

            trans[langName] = data.translation;
            if (data.meta) {
              meta[langName] = data.meta;
            }

            if (dbType === 'postgres') {
              await tx.run(
                'UPDATE terms SET translations = $1::jsonb, translations_meta = $2::jsonb WHERE id = $3',
                [JSON.stringify(trans), JSON.stringify(meta), termId]
              );
            } else {
              await tx.run(
                'UPDATE terms SET translations = $1, translations_meta = $2 WHERE id = $3',
                [JSON.stringify(trans), JSON.stringify(meta), termId]
              );
            }
          }
        }
      }

      await tx.run('DELETE FROM recycle_bin WHERE id = $1', [id]);
    });

    res.json({ message: '数据已成功一键恢复！' });
  } catch (err) {
    console.error('还原数据失败:', err);
    res.status(500).json({ error: err.message || '还原数据失败，请稍后重试。' });
  }
});

// DELETE /api/recycle-bin/:id - 彻底删除数据
router.delete('/recycle-bin/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const item = await db.queryOne('SELECT * FROM recycle_bin WHERE id = $1', [id]);
    if (!item) {
      return res.status(404).json({ error: '回收站条目未找到' });
    }

    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
    let projectId = '';
    if (item.entity_type === 'version' && payload.version) {
      projectId = payload.version.project_id;
    } else if (item.entity_type === 'glossary_table' && payload.glossary_table) {
      projectId = payload.glossary_table.project_id;
    } else if (item.entity_type === 'language' && payload.language) {
      projectId = payload.language.project_id;
    }

    if (projectId) {
      const member = await db.queryOne(
        'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, req.user.id]
      );
      if ((!member || member.role !== 'owner') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '只有项目所有者或系统管理员能够彻底删除回收站条目。' });
      }
    }

    await db.run('DELETE FROM recycle_bin WHERE id = $1', [id]);
    res.json({ message: '数据已从回收站彻底销毁。' });
  } catch (err) {
    console.error('彻底删除失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
