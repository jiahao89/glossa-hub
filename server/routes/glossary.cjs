const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../config/db.cjs');
const { authenticateToken, requireProjectMember, requireRole } = require('../middleware/auth.cjs');
const { backupToRecycleBin } = require('../services/recycleBin.cjs');

// GET /api/projects/:projectId/glossary-tables - 获取专业词汇大表列表
router.get('/projects/:projectId/glossary-tables', authenticateToken, requireProjectMember, async (req, res) => {
  const { projectId } = req.params;
  try {
    const tables = await db.query('SELECT * FROM glossary_tables WHERE project_id = $1 ORDER BY table_name ASC', [projectId]);
    const mapped = tables.map(t => {
      let headersParsed = [];
      try {
        headersParsed = JSON.parse(t.headers || '["中文专业术语","英文翻译对应","说明 / 定义"]');
      } catch {
        headersParsed = ["中文专业术语", "英文翻译对应", "说明 / 定义"];
      }
      return { ...t, headers: headersParsed };
    });
    res.json(mapped);
  } catch (err) {
    console.error('加载词汇表失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/projects/:projectId/glossary-tables - 创建新的专业词汇表
router.post('/projects/:projectId/glossary-tables', authenticateToken, requireProjectMember, requireRole(['owner', 'editor']), async (req, res) => {
  const { projectId } = req.params;
  const { tableName } = req.body;
  if (!tableName) {
    return res.status(400).json({ error: '表名称不能为空' });
  }

  try {
    const existing = await db.queryOne(
      'SELECT id FROM glossary_tables WHERE project_id = $1 AND table_name = $2',
      [projectId, tableName]
    );
    if (existing) {
      return res.status(409).json({ error: '已存在同名词汇大表' });
    }

    const tableId = crypto.randomUUID();
    const createdTime = new Date().toISOString();
    await db.run(
      'INSERT INTO glossary_tables (id, project_id, table_name, created_at) VALUES ($1, $2, $3, $4)',
      [tableId, projectId, tableName, createdTime]
    );
    res.status(201).json({ id: tableId, table_name: tableName, created_at: createdTime, headers: ["中文专业术语", "英文翻译对应", "说明 / 定义"] });
  } catch (err) {
    console.error('创建词汇大表失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// DELETE /api/projects/:projectId/glossary-tables/:tableId - 删除专业词汇大表
router.delete('/projects/:projectId/glossary-tables/:tableId', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId, tableId } = req.params;
  try {
    const tbl = await db.queryOne('SELECT id, table_name FROM glossary_tables WHERE id = $1 AND project_id = $2', [tableId, projectId]);
    if (!tbl) {
      return res.status(404).json({ error: '词汇表未找到' });
    }

    await backupToRecycleBin('glossary_table', tableId, tbl.table_name, req.user.id);
    await db.run('DELETE FROM glossary_tables WHERE id = $1', [tableId]);
    res.json({ message: `专业词汇表 [${tbl.table_name}] 已成功移入回收站。` });
  } catch (err) {
    console.error('删除词汇表失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// GET /api/glossary-tables/:tableId/terms - 获取专业词汇表下的所有术语
router.get('/glossary-tables/:tableId/terms', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  try {
    const terms = await db.query('SELECT * FROM glossary_terms WHERE table_id = $1 ORDER BY cn_term ASC', [tableId]);
    const mapped = terms.map(t => {
      let fieldsParsed = {};
      try {
        fieldsParsed = JSON.parse(t.fields || '{}');
      } catch {
        fieldsParsed = {};
      }
      return { ...t, fields: fieldsParsed };
    });
    res.json(mapped);
  } catch (err) {
    console.error('加载专业术语列表失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/glossary-tables/:tableId/terms - 新增/批量导入术语
router.post('/glossary-tables/:tableId/terms', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  const { cnTerm, enTerm, description, termsList, headers } = req.body;

  try {
    if (Array.isArray(termsList)) {
      const createdTime = new Date().toISOString();
      await db.transaction(async (tx) => {
        if (Array.isArray(headers) && headers.length > 0) {
          await tx.run('UPDATE glossary_tables SET headers = $1 WHERE id = $2', [JSON.stringify(headers), tableId]);
        }

        await tx.run('DELETE FROM glossary_terms WHERE table_id = $1', [tableId]);

        for (const t of termsList) {
          const cn = (t.cnTerm || '').trim();
          const en = (t.enTerm || '').trim();
          if (!cn && !en) continue;

          const termId = crypto.randomUUID();
          const fieldsJson = JSON.stringify(t.fields || {});
          await tx.run(
            'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [termId, tableId, cn, en, (t.description || '').trim(), createdTime, fieldsJson]
          );
        }
      });
      return res.status(201).json({ message: `成功覆盖导入了 ${termsList.length} 条专业术语！`, count: termsList.length });
    }

    if (!cnTerm && !enTerm) {
      return res.status(400).json({ error: '术语名称或翻译不能为空' });
    }

    const existing = await db.queryOne('SELECT id FROM glossary_terms WHERE table_id = $1 AND cn_term = $2', [tableId, cnTerm]);
    if (existing) {
      return res.status(409).json({ error: '该专业术语在此表已存在' });
    }

    const termId = crypto.randomUUID();
    const createdTime = new Date().toISOString();
    const defaultFields = {
      "中文专业术语": cnTerm,
      "英文翻译对应": enTerm,
      "说明 / 定义": description || ''
    };

    await db.run(
      'INSERT INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [termId, tableId, cnTerm.trim(), enTerm.trim(), (description || '').trim(), createdTime, JSON.stringify(defaultFields)]
    );

    res.status(201).json({
      id: termId,
      cn_term: cnTerm,
      en_term: enTerm,
      description,
      fields: defaultFields
    });
  } catch (err) {
    console.error('添加专业术语失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// DELETE /api/glossary-tables/:tableId/terms/:termId - 删除单个术语
router.delete('/glossary-tables/:tableId/terms/:termId', authenticateToken, async (req, res) => {
  const { tableId, termId } = req.params;
  try {
    const existing = await db.queryOne('SELECT id FROM glossary_terms WHERE id = $1 AND table_id = $2', [termId, tableId]);
    if (!existing) {
      return res.status(404).json({ error: '术语未找到' });
    }

    await db.run('DELETE FROM glossary_terms WHERE id = $1', [termId]);
    res.json({ message: '术语已成功删除' });
  } catch (err) {
    console.error('删除术语失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
