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

    await db.transaction(async (tx) => {
      if (oldName !== newName) {
        const versions = await tx.query('SELECT id FROM versions WHERE project_id = $1', [projectId]);
        const versionIds = versions.map(v => v.id);

        if (versionIds.length > 0) {
          const versionPlaceholders = versionIds.map((_, idx) => `$${idx + 1}`).join(',');
          const allTerms = await tx.query(
            `SELECT id, translations FROM terms WHERE version_id IN (${versionPlaceholders})`,
            versionIds
          );

          for (const term of allTerms) {
            let trans = {};
            try {
              trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
            } catch {
              trans = {};
            }

            if (trans[oldName] !== undefined) {
              trans[newName] = trans[oldName];
              delete trans[oldName];

              if (dbType === 'postgres') {
                await tx.run(
                  'UPDATE terms SET translations = $1::jsonb WHERE id = $2',
                  [JSON.stringify(trans), term.id]
                );
              } else {
                await tx.run(
                  'UPDATE terms SET translations = $1 WHERE id = $2',
                  [JSON.stringify(trans), term.id]
                );
              }
            }
          }
        }
      }

      await tx.run(
        'UPDATE languages SET lang_name = $1, display_order = $2 WHERE id = $3',
        [newName, newOrder, langId]
      );
    });

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
        const allTerms = await tx.query(
          `SELECT id, translations FROM terms WHERE version_id IN (${versionPlaceholders})`,
          versionIds
        );

        for (const term of allTerms) {
          let trans = {};
          try {
            trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
          } catch {
            trans = {};
          }

          if (trans[oldName] !== undefined) {
            delete trans[oldName];
            if (dbType === 'postgres') {
              await tx.run(
                'UPDATE terms SET translations = $1::jsonb WHERE id = $2',
                [JSON.stringify(trans), term.id]
              );
            } else {
              await tx.run(
                'UPDATE terms SET translations = $1 WHERE id = $2',
                [JSON.stringify(trans), term.id]
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
