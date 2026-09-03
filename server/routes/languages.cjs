const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireProjectMember, requireRole } = require('../middleware/auth.cjs');
const { backupToRecycleBin } = require('../services/recycleBin.cjs');

// GET /api/projects/:projectId/languages - 获取项目的语种字典列表
router.get('/projects/:projectId/languages', authenticateToken, requireProjectMember, async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await db.query(
      'SELECT * FROM languages WHERE project_id = $1 ORDER BY display_order ASC',
      [projectId]
    );
    res.json(rows);
  } catch (err) {
    console.error('获取项目语言列表失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/projects/:projectId/languages - 添加新的语种
router.post('/projects/:projectId/languages', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId } = req.params;
  const { langCode, langName } = req.body;

  if (!langCode || !langName) {
    return res.status(400).json({ error: 'langCode 和 langName 不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM languages WHERE project_id = $1 AND (lang_code = $2 OR lang_name = $3)',
      [projectId, langCode, langName]
    );
    if (existing) {
      return res.status(400).json({ error: '该项目中已存在相同代码或显示名称的语种！' });
    }

    const maxOrderRow = await db.queryOne(
      'SELECT MAX(display_order) as max_order FROM languages WHERE project_id = $1',
      [projectId]
    );
    const nextOrder = (maxOrderRow?.max_order || 0) + 1;

    const langId = crypto.randomUUID();
    if (getDbType() === 'postgres') {
      await db.run(
        `INSERT INTO languages (id, project_id, lang_code, lang_name, display_order, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [langId, projectId, langCode, langName, nextOrder]
      );
    } else {
      await db.run(
        `INSERT INTO languages (id, project_id, lang_code, lang_name, display_order, created_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
        [langId, projectId, langCode, langName, nextOrder]
      );
    }

    res.status(201).json({ id: langId, langCode, langName, displayOrder: nextOrder });
  } catch (err) {
    console.error('添加语种失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// PUT /api/projects/:projectId/languages/:langId - 修改语种（支持重命名及翻译字段迁移）
router.put('/projects/:projectId/languages/:langId', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId, langId } = req.params;
  const { langName, displayOrder } = req.body;
  const dbType = getDbType();

  try {
    const oldLang = await db.queryOne('SELECT * FROM languages WHERE id = $1', [langId]);
    if (!oldLang) {
      return res.status(404).json({ error: '语种未找到' });
    }

    const oldName = oldLang.lang_name;
    const newName = langName || oldName;
    const newOrder = displayOrder !== undefined ? displayOrder : oldLang.display_order;

    if (dbType === 'postgres') {
      // PG 分支: 单条 jsonb 语句完成翻译键迁移，避免全量载入内存逐条 UPDATE
      await db.transaction(async (tx) => {
        if (oldName !== newName) {
          const versions = await tx.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
          const versionIds = versions.map(v => v.id);

          if (versionIds.length > 0) {
            const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
            const oldKeyPh = `$${versionIds.length + 1}`;
            const newKeyPh = `$${versionIds.length + 2}`;
            // translations / translations_meta ? 旧键 仅命中存在旧键的行：
            // 复制旧键值到新键后删除旧键；若新键已存在则被覆盖
            await tx.run(
              `UPDATE terms
               SET translations = (translations - ${oldKeyPh}) || jsonb_build_object(${newKeyPh}, translations -> ${oldKeyPh}),
                   translations_meta = CASE 
                     WHEN translations_meta ? ${oldKeyPh} 
                     THEN (translations_meta - ${oldKeyPh}) || jsonb_build_object(${newKeyPh}, translations_meta -> ${oldKeyPh})
                     ELSE translations_meta 
                   END
               WHERE version_id IN (${versionPlaceholders}) AND (translations ? ${oldKeyPh} OR translations_meta ? ${oldKeyPh})`,
              [...versionIds, oldName, newName]
            );
          }
        }

        await tx.run(
          'UPDATE languages SET lang_name = $1, display_order = $2 WHERE id = $3',
          [newName, newOrder, langId]
        );
      });
    } else {
      // SQLite 分支: 保留逐条迁移，但改为分批提交（每 500 条一次事务），降低长时间持锁
      if (oldName !== newName) {
        const versions = await db.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
        const versionIds = versions.map(v => v.id);

        if (versionIds.length > 0) {
          const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
          const allTerms = await db.query(
            `SELECT id, translations, translations_meta FROM terms WHERE version_id IN (${versionPlaceholders})`,
            versionIds
          );

          const updates = [];
          for (const term of allTerms) {
            let trans = {};
            let meta = {};
            try {
              trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
              meta = typeof term.translations_meta === 'string' ? JSON.parse(term.translations_meta || '{}') : (term.translations_meta || {});
            } catch {
              trans = {};
              meta = {};
            }

            let changed = false;
            if (trans[oldName] !== undefined) {
              trans[newName] = trans[oldName];
              delete trans[oldName];
              changed = true;
            }
            if (meta[oldName] !== undefined) {
              meta[newName] = meta[oldName];
              delete meta[oldName];
              changed = true;
            }

            if (changed) {
              updates.push({ id: term.id, transJson: JSON.stringify(trans), metaJson: JSON.stringify(meta) });
            }
          }

          const BATCH_SIZE = 500;
          for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            await db.transaction(async (tx) => {
              for (const u of batch) {
                await tx.run(
                  'UPDATE terms SET translations = $1, translations_meta = $2 WHERE id = $3',
                  [u.transJson, u.metaJson, u.id]
                );
              }
            });
          }
        }
      }

      await db.run(
        'UPDATE languages SET lang_name = $1, display_order = $2 WHERE id = $3',
        [newName, newOrder, langId]
      );
    }

    res.json({ message: '语种修改及词条映射同步成功！' });
  } catch (err) {
    console.error('修改语种失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// DELETE /api/projects/:projectId/languages/:langId - 删除语种
router.delete('/projects/:projectId/languages/:langId', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId, langId } = req.params;
  const dbType = getDbType();

  try {
    const lang = await db.queryOne('SELECT * FROM languages WHERE id = $1', [langId]);
    if (!lang) {
      return res.status(404).json({ error: '语种未找到' });
    }

    const oldName = lang.lang_name;

    await backupToRecycleBin('language', langId, lang.lang_name, req.user.id);

    await db.transaction(async (tx) => {
      const versions = await tx.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
      const versionIds = versions.map(v => v.id);

      if (versionIds.length > 0) {
        const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
        const oldKeyPh = `$${versionIds.length + 1}`;

        if (dbType === 'postgres') {
          // PG 分支: 使用单条 jsonb 键减法语句高效删除键
          await tx.run(
            `UPDATE terms
             SET translations = translations - ${oldKeyPh},
                 translations_meta = translations_meta - ${oldKeyPh}
             WHERE version_id IN (${versionPlaceholders}) AND (translations ? ${oldKeyPh} OR translations_meta ? ${oldKeyPh})`,
            [...versionIds, oldName]
          );
        } else {
          const allTerms = await tx.query(
            `SELECT id, translations, translations_meta FROM terms WHERE version_id IN (${versionPlaceholders})`,
            versionIds
          );

          for (const term of allTerms) {
            let trans = {};
            let meta = {};
            try {
              trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
              meta = typeof term.translations_meta === 'string' ? JSON.parse(term.translations_meta || '{}') : (term.translations_meta || {});
            } catch {
              trans = {};
              meta = {};
            }

            let changed = false;
            if (trans[oldName] !== undefined) {
              delete trans[oldName];
              changed = true;
            }
            if (meta[oldName] !== undefined) {
              delete meta[oldName];
              changed = true;
            }

            if (changed) {
              await tx.run(
                'UPDATE terms SET translations = $1, translations_meta = $2 WHERE id = $3',
                [JSON.stringify(trans), JSON.stringify(meta), term.id]
              );
            }
          }
        }
      }

      await tx.run('DELETE FROM languages WHERE id = $1', [langId]);
    });

    res.json({ message: '语种及关联词条翻译成功清除！' });
  } catch (err) {
    console.error('删除语种失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
