const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireProjectMember, requireRole } = require('../middleware/auth.cjs');
const { backupToRecycleBin } = require('../services/recycleBin.cjs');
const { createAuditLog } = require('../services/auditLogger.cjs');

// GET /api/tables - 获取所有固件版本表
router.get('/tables', authenticateToken, async (_req, res) => {
  try {
    const versions = await db.query(
      `SELECT v.id, v.version_name AS name, v.created_at, u.name AS creator_name
       FROM versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.project_id = $1
       ORDER BY v.created_at DESC`,
      ['proj-default']
    );

    const updatedVersions = versions.map(ver => ({
      id: ver.id,
      name: ver.name,
      created_at: ver.created_at,
      creator_name: ver.creator_name || '系统默认',
      last_modified: ver.created_at
    }));

    res.json(updatedVersions);
  } catch (err) {
    console.error('获取版本列表失败:', err);
    res.status(500).json({ error: `获取版本列表失败: ${err.message}` });
  }
});

// POST /api/projects/:projectId/versions - 创建固件新版本
router.post('/projects/:projectId/versions', authenticateToken, requireProjectMember, requireRole(['owner', 'editor']), async (req, res) => {
  const { projectId } = req.params;
  const { versionName, baseVersionId } = req.body;
  if (!versionName) {
    return res.status(400).json({ error: '版本名称不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM versions WHERE project_id = $1 AND version_name = $2',
      [projectId, versionName]
    );
    if (existing) {
      return res.status(409).json({ error: '该版本已存在' });
    }

    const versionId = crypto.randomUUID();
    let createdBy = req.user?.id || null;
    if (createdBy) {
      try {
        const u = await db.queryOne('SELECT id FROM users WHERE id = $1', [createdBy]);
        if (!u) createdBy = null;
      } catch {
        createdBy = null;
      }
    }

    if (getDbType() === 'postgres') {
      await db.run(
        'INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, NOW(), $4)',
        [versionId, projectId, versionName, createdBy]
      );
    } else {
      await db.run(
        "INSERT INTO versions (id, project_id, version_name, created_at, created_by) VALUES ($1, $2, $3, datetime('now'), $4)",
        [versionId, projectId, versionName, createdBy]
      );
    }

    let totalTerms = 0;
    if (baseVersionId) {
      const countRes = await db.queryOne(
        'SELECT COUNT(*) AS count FROM terms WHERE version_id = $1',
        [baseVersionId]
      );
      totalTerms = parseInt(countRes?.count || 0, 10);
    }

    await createAuditLog({
      action: '创建版本',
      details: `新建固件大表版本 [${versionName}]${baseVersionId ? ` (继承自已有版本 ${totalTerms} 条词条)` : ''}`,
      versionName,
      userId: req.user.id
    });

    res.status(201).json({ id: versionId, versionName, totalTerms });
  } catch (err) {
    console.error('新建固件版本失败:', err);
    res.status(500).json({ error: `创建版本失败: ${err.message}` });
  }
});

// POST /api/projects/:projectId/versions/:versionId/inherit-chunk - 分批继承词条 API
router.post('/projects/:projectId/versions/:versionId/inherit-chunk', authenticateToken, requireProjectMember, requireRole(['owner', 'editor']), async (req, res) => {
  const { versionId } = req.params;
  const { baseVersionId, offset = 0, limit = 100 } = req.body;
  const dbType = getDbType();

  if (!baseVersionId) {
    return res.status(400).json({ error: '基准版本 ID 不能为空' });
  }

  try {
    const baseTerms = await db.query(
      'SELECT kw, context, owner, zh_cn, translations, translations_meta FROM terms WHERE version_id = $1 ORDER BY created_at ASC, id ASC LIMIT $2 OFFSET $3',
      [baseVersionId, limit, offset]
    );

    if (baseTerms.length === 0) {
      return res.json({ success: true, processed: 0 });
    }

    if (dbType === 'postgres') {
      const valuePlaceholders = [];
      const values = [];
      let paramIdx = 1;

      for (const term of baseTerms) {
        const newTermId = crypto.randomUUID();
        const translationsStr = typeof term.translations === 'string'
          ? term.translations
          : JSON.stringify(term.translations || {});
        const translationsMetaStr = typeof term.translations_meta === 'string'
          ? term.translations_meta
          : JSON.stringify(term.translations_meta || {});

        valuePlaceholders.push(
          `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}::jsonb, $${paramIdx + 7}::jsonb, NOW(), NOW(), FALSE)`
        );
        values.push(
          newTermId,
          versionId,
          term.kw,
          term.context ?? null,
          term.owner ?? null,
          term.zh_cn,
          translationsStr,
          translationsMetaStr
        );
        paramIdx += 8;
      }

      const sql = `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT (version_id, kw) DO NOTHING`;
      await db.run(sql, values);
    } else {
      const valuePlaceholders = [];
      const values = [];

      for (const term of baseTerms) {
        const newTermId = crypto.randomUUID();
        const translationsStr = typeof term.translations === 'string'
          ? term.translations
          : JSON.stringify(term.translations || {});
        const translationsMetaStr = typeof term.translations_meta === 'string'
          ? term.translations_meta
          : JSON.stringify(term.translations_meta || {});

        valuePlaceholders.push(`(?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)`);
        values.push(
          newTermId,
          versionId,
          term.kw,
          term.context ?? null,
          term.owner ?? null,
          term.zh_cn,
          translationsStr,
          translationsMetaStr
        );
      }

      const sql = `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked) VALUES ${valuePlaceholders.join(', ')}`;
      await db.run(sql, values);
    }

    res.json({ success: true, processed: baseTerms.length });
  } catch (err) {
    console.error('分批继承词条失败:', err);
    res.status(500).json({ error: `继承词条失败: ${err.message}` });
  }
});

// DELETE /api/projects/:projectId/versions/:versionId - 删除数据表（固件大表）
router.delete('/projects/:projectId/versions/:versionId', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId, versionId } = req.params;
  try {
    const ver = await db.queryOne('SELECT id, version_name FROM versions WHERE id = $1 AND project_id = $2', [versionId, projectId]);
    if (!ver) {
      return res.status(404).json({ error: '数据表未找到' });
    }

    await backupToRecycleBin('version', versionId, ver.version_name, req.user.id);
    await db.run('DELETE FROM versions WHERE id = $1', [versionId]);

    await createAuditLog({
      action: '删除版本',
      details: `删除固件大表 [${ver.version_name}] 并移入回收站`,
      versionName: ver.version_name,
      userId: req.user.id
    });

    res.json({ message: `固件数据表 [${ver.version_name}] 已成功移入回收站。` });
  } catch (err) {
    console.error('删除固件版本失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// PUT /api/projects/:projectId/versions/:versionId - 修改数据表名称
router.put('/projects/:projectId/versions/:versionId', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId, versionId } = req.params;
  const { versionName } = req.body;

  if (!versionName || !versionName.trim()) {
    return res.status(400).json({ error: '数据表名称不能为空' });
  }

  try {
    const newName = versionName.trim();
    const existing = await db.queryOne(
      'SELECT id FROM versions WHERE project_id = $1 AND version_name = $2 AND id != $3',
      [projectId, newName, versionId]
    );
    if (existing) {
      return res.status(409).json({ error: '已存在同名数据表，请使用其他名称' });
    }

    await db.run(
      'UPDATE versions SET version_name = $1 WHERE id = $2 AND project_id = $3',
      [newName, versionId, projectId]
    );

    await createAuditLog({
      action: '重命名版本',
      details: `将固件大表重命名为 [${newName}]`,
      versionName: newName,
      userId: req.user.id
    });

    res.json({ message: '数据表名称更新成功', name: newName });
  } catch (err) {
    console.error('更新数据表名称失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/versions/:versionId/inherit-translations - 翻译记忆库批量继承覆盖未翻译部分
router.post('/versions/:versionId/inherit-translations', authenticateToken, async (req, res) => {
  const { versionId } = req.params;
  const { sourceVersionId } = req.body;
  const dbType = getDbType();

  if (!sourceVersionId) {
    return res.status(400).json({ error: '必须指定源版本 ID (sourceVersionId)' });
  }

  try {
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [versionId]);
    const sourceVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [sourceVersionId]);

    if (!targetVer || !sourceVer) {
      return res.status(404).json({ error: '指定的源版本或目标版本不存在！' });
    }

    let inheritCount = 0;

    await db.transaction(async (tx) => {
      const srcTerms = await tx.query('SELECT kw, translations FROM terms WHERE version_id = $1', [sourceVersionId]);
      const tgtTerms = await tx.query('SELECT id, kw, translations, is_locked FROM terms WHERE version_id = $1', [versionId]);

      const srcMap = {};
      srcTerms.forEach(t => {
        srcMap[t.kw] = typeof t.translations === 'string' ? JSON.parse(t.translations) : (t.translations || {});
      });

      for (const tgt of tgtTerms) {
        if (tgt.is_locked === 1 || tgt.is_locked === true) continue;

        const srcTrans = srcMap[tgt.kw];
        if (!srcTrans) continue;

        const tgtTrans = typeof tgt.translations === 'string' ? JSON.parse(tgt.translations) : (tgt.translations || {});
        let merged = false;

        Object.keys(srcTrans).forEach(lang => {
          if (srcTrans[lang] && (!tgtTrans[lang] || tgtTrans[lang].trim() === '')) {
            tgtTrans[lang] = srcTrans[lang];
            merged = true;
          }
        });

        if (merged) {
          const updatedTransStr = JSON.stringify(tgtTrans);
          if (dbType === 'postgres') {
            await tx.run(
              'UPDATE terms SET translations = $1::jsonb, updated_at = NOW(), updated_by = $2 WHERE id = $3',
              [updatedTransStr, req.user.id, tgt.id]
            );
          } else {
            await tx.run(
              "UPDATE terms SET translations = $1, updated_at = datetime('now'), updated_by = $2 WHERE id = $3",
              [updatedTransStr, req.user.id, tgt.id]
            );
          }
          inheritCount++;
        }
      }

      if (inheritCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const details = `从版本 [${sourceVer.version_name}] 批量继承翻译覆盖到 [${targetVer.version_name}]，合并继承了 ${inheritCount} 条词条。`;

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '翻译继承', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '翻译继承', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功从 [${sourceVer.version_name}] 继承并补全翻译！`,
      inheritedCount: inheritCount
    });
  } catch (err) {
    console.error('批量继承翻译失败:', err);
    res.status(500).json({ error: '合并继承处理中发生服务器内部错误。' });
  }
});

module.exports = router;
