const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireTermOwnership, requireVersionOwnership } = require('../middleware/auth.cjs');
const { writeLimiter } = require('../middleware/rateLimiters.cjs');
const { parseJsonField } = require('../utils/jsonFields.cjs');
const { TARGET_LANGUAGES } = require('../config/constants.cjs');

// GET /api/tables/:tableId/records - 读取特定版本下的所有词条数据 (分页)
router.get('/tables/:tableId/records', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const search = req.query.search || '';
  const statusFilter = req.query.status || '';
  const untranslated = req.query.untranslated === 'true' || req.query.untranslated === '1';

  try {
    const dbType = getDbType();
    let whereClause = 'WHERE version_id = $1';
    const queryParams = [tableId];
    let paramIndex = 2;

    if (search) {
      if (dbType === 'sqlite') {
        const p1 = paramIndex, p2 = paramIndex + 1, p3 = paramIndex + 2, p4 = paramIndex + 3;
        whereClause += ` AND (kw LIKE $${p1} OR zh_cn LIKE $${p2} OR context LIKE $${p3} OR translations LIKE $${p4})`;
        const searchPattern = `%${search}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        paramIndex += 4;
      } else {
        whereClause += ` AND (kw ILIKE $${paramIndex} OR zh_cn ILIKE $${paramIndex} OR context ILIKE $${paramIndex} OR translations::text ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }
    }

    if (statusFilter) {
      if (statusFilter === 'DRAFT') {
        whereClause += ` AND (status = 'DRAFT' OR status = 'PENDING_REVIEW' OR status = 'TRANSLATING')`;
      } else {
        whereClause += ` AND status = $${paramIndex}`;
        queryParams.push(statusFilter);
        paramIndex++;
      }
    }

    if (untranslated) {
      if (dbType === 'sqlite') {
        const conditions = TARGET_LANGUAGES.map(lang => `(json_extract(translations, '$.${lang}') IS NULL OR json_extract(translations, '$.${lang}') = '')`);
        whereClause += ` AND (${conditions.join(' OR ')})`;
      } else {
        const conditions = TARGET_LANGUAGES.map(lang => `(translations->>'${lang}' IS NULL OR translations->>'${lang}' = '')`);
        whereClause += ` AND (${conditions.join(' OR ')})`;
      }
    }

    const countQuery = `SELECT COUNT(*) as total FROM terms ${whereClause}`;
    const dataQuery = `SELECT * FROM terms ${whereClause} ORDER BY kw ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    const countResult = await db.queryOne(countQuery, queryParams);
    const total = parseInt(countResult?.total || 0, 10);
    
    const dataParams = [...queryParams, pageSize, (page - 1) * pageSize];
    const terms = await db.query(dataQuery, dataParams);

    const formatted = terms.map(term => {
      const trans = parseJsonField(term.translations);
      const transMeta = parseJsonField(term.translations_meta);

      return {
        recordId: term.id,
        createdAt: term.created_at,
        updatedAt: term.updated_at,
        isLocked: term.is_locked || 0,
        lockedBy: term.locked_by || '',
        lockedAt: term.locked_at || '',
        status: term.status || 'DRAFT',
        rejectReason: term.reject_reason || '',
        translationsMeta: transMeta,
        fields: {
          KW: term.kw && term.kw.startsWith('__EMPTY_KW_') ? '' : term.kw,
          'CN（中文）': term.zh_cn,
          所在页面: term.context || '',
          字号类别: term.owner || '',
          ...trans
        }
      };
    });

    res.json({
      total,
      page,
      pageSize,
      records: formatted
    });
  } catch (err) {
    console.error('获取词条数据失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});


// GET /api/terms/by-kw-version - 按 KW 和版本名查找词条及其快照
router.get('/terms/by-kw-version', authenticateToken, async (req, res) => {
  const { kw, versionName, projectId } = req.query;
  if (!kw || !versionName) {
    return res.status(400).json({ error: '缺少 kw 或 versionName 参数' });
  }
  try {
    const effectiveProjectId = projectId || 'proj-default';
    const term = await db.queryOne(
      `SELECT t.id, t.kw, t.zh_cn, t.is_locked FROM terms t
       JOIN versions v ON t.version_id = v.id
       WHERE t.kw = $1 AND v.version_name = $2 AND v.project_id = $3`,
      [kw, versionName, effectiveProjectId]
    );
    if (!term) {
      return res.status(404).json({ error: '找不到对应词条，可能已被删除' });
    }
    const snapshots = await db.query(
      `SELECT s.id, s.kw, s.zh_cn, s.translations, s.created_at, s.created_by, u.username as creator_name
       FROM term_snapshots s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.term_id = $1
       ORDER BY s.created_at DESC`,
      [term.id]
    );
    const formatted = snapshots.map(s => {
      const trans = parseJsonField(s.translations);
      return {
        id: s.id, kw: s.kw, zh_cn: s.zh_cn,
        translations: trans, createdAt: s.created_at,
        creatorName: s.creator_name || '系统用户'
      };
    });
    res.json({ termId: term.id, isLocked: !!(term.is_locked === 1 || term.is_locked === true), snapshots: formatted });
  } catch (err) {
    console.error('按 KW 查找词条失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/terms/:termId - 带乐观锁并发校验的词条更新接口
router.put('/terms/:termId', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { kw, context, owner, zh_cn, translations, translationsMeta, oldUpdatedAt } = req.body;
  const dbType = getDbType();

  if (!oldUpdatedAt) {
    return res.status(400).json({ error: '必须包含旧修改时间戳 (oldUpdatedAt) 以进行并发校验' });
  }

  try {
    const termMembership = await db.queryOne(
      'SELECT pm.role FROM terms t JOIN versions v ON t.version_id = v.id JOIN project_members pm ON v.project_id = pm.project_id WHERE t.id = $1 AND pm.user_id = $2',
      [termId, req.user.id]
    );
    if (termMembership && termMembership.role === 'viewer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '只读审核人员无权修改词条。' });
    }
    if (!(await requireTermOwnership(req.user.id, termId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权修改此词条。' });
    }
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    if (term.is_locked === 1 || term.is_locked === true) {
      return res.status(403).json({ error: 'LOCKED', message: '该词条目前已被锁定，无法修改。如需变更请联系管理员解锁！' });
    }

    let finalKw = (kw !== undefined ? kw : term.kw).trim();
    if (!finalKw) {
      finalKw = `__EMPTY_KW_${crypto.randomUUID()}__`;
    }

    if (finalKw && !finalKw.startsWith('__EMPTY_KW_') && finalKw !== term.kw) {
      const duplicate = await db.queryOne(
        'SELECT id, zh_cn FROM terms WHERE version_id = $1 AND LOWER(kw) = LOWER($2) AND id <> $3',
        [term.version_id, finalKw, termId]
      );
      if (duplicate) {
        return res.status(409).json({
          error: 'DUPLICATE_KW',
          message: `无法保存！该 KW [${finalKw}] 已被当前表内其他词条占用 (中文: “${duplicate.zh_cn}”)。`
        });
      }
    }

    const finalContext = context !== undefined ? context : (term.context || '');
    const finalOwner = owner !== undefined ? owner : (term.owner || '');
    const finalZhCn = zh_cn !== undefined ? zh_cn : term.zh_cn;

    let updatedTrans = '';
    const inputTrans = translations !== undefined ? translations : term.translations;
    if (typeof inputTrans === 'string') {
      try {
        const parsed = JSON.parse(inputTrans);
        if (typeof parsed === 'string') {
          updatedTrans = parsed;
        } else {
          updatedTrans = inputTrans;
        }
      } catch {
        updatedTrans = '{}';
      }
    } else {
      updatedTrans = JSON.stringify(inputTrans || {});
    }

    const dbTransStr = typeof term.translations === 'string' ? term.translations : JSON.stringify(term.translations || {});
    const isTransChanged = dbTransStr !== updatedTrans;
    const isZhChanged = finalZhCn && term.zh_cn !== finalZhCn;
    const isKwChanged = finalKw !== term.kw;

    let nextStatus = 'PENDING_REVIEW';
    if (req.user.role === 'admin') {
      nextStatus = 'APPROVED';
    }

    const updateResult = await db.transaction(async (tx) => {
      if (isTransChanged || isZhChanged || isKwChanged) {
        const snapshotId = crypto.randomUUID();
        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), $7)`,
            [snapshotId, termId, term.version_id, term.kw, term.zh_cn, dbTransStr, req.user.id]
          );
        } else {
          const snapNow = new Date().toISOString();
          await tx.run(
            `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [snapshotId, termId, term.version_id, term.kw, term.zh_cn, dbTransStr, snapNow, req.user.id]
          );
        }
      }

      if (dbType === 'postgres') {
        return await tx.run(
          `UPDATE terms
           SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5::jsonb, translations_meta = $6::jsonb, status = $7, reject_reason = NULL, updated_at = NOW(), updated_by = $8
           WHERE id = $9 AND date_trunc('ms', updated_at) = date_trunc('ms', $10::timestamptz)`,
          [finalKw, finalContext, finalOwner, finalZhCn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, req.user.id, termId, oldUpdatedAt]
        );
      } else {
        const nowIso = new Date().toISOString();
        return await tx.run(
          `UPDATE terms
           SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, translations_meta = $6, status = $7, reject_reason = NULL, updated_at = $8, updated_by = $9
           WHERE id = $10 AND updated_at = $11`,
          [finalKw, finalContext, finalOwner, finalZhCn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, nowIso, req.user.id, termId, oldUpdatedAt]
        );
      }
    });

    const affectedRows = updateResult.changes || 0;
    if (affectedRows === 0) {
      return res.status(409).json({ error: 'CONCURRENCY_CONFLICT', message: '该词条已被其他人修改，请刷新后重试。' });
    }

    const newTerm = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    res.json(newTerm);
  } catch (err) {
    console.error('修改词条失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// PUT /api/terms/:termId/lock - 锁定/解锁词条接口
router.put('/terms/:termId/lock', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  const { isLocked } = req.body;
  const dbType = getDbType();

  try {
    const memberRoleRes = await db.queryOne(
      'SELECT pm.role FROM terms t JOIN versions v ON t.version_id = v.id JOIN project_members pm ON v.project_id = pm.project_id WHERE t.id = $1 AND pm.user_id = $2',
      [termId, req.user.id]
    );
    const projectRole = memberRoleRes ? memberRoleRes.role : null;
    if (req.user.role !== 'admin' && projectRole !== 'owner') {
      return res.status(403).json({ error: 'FORBIDDEN', message: '只有项目所有者或系统管理员可以锁定/解锁词条。' });
    }
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    const lockValue = isLocked ? 1 : 0;

    if (dbType === 'postgres') {
      await db.run(
        `UPDATE terms SET is_locked = $1, locked_by = $2, locked_at = NOW() WHERE id = $3`,
        [lockValue, isLocked ? req.user.id : null, termId]
      );
    } else {
      await db.run(
        `UPDATE terms SET is_locked = $1, locked_by = $2, locked_at = datetime('now') WHERE id = $3`,
        [lockValue, isLocked ? req.user.id : null, termId]
      );
    }

    const actionName = isLocked ? '锁定词条' : '解锁词条';
    const ver = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [term.version_id]);
    const verName = ver ? ver.version_name : '未知版本';

    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    if (dbType === 'postgres') {
      await db.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
        [term.kw, term.zh_cn, actionName, `${req.user.name} 对词条进行了${actionName}`, verName, req.user.id]
      );
    } else {
      await db.run(
        `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
         VALUES (datetime('now'), $1, $2, $3, $4, $5, $6)`,
        [term.kw, term.zh_cn, actionName, `${req.user.name} 对词条进行了${actionName}`, verName, req.user.id]
      );
    }

    res.json({ id: termId, is_locked: lockValue, message: `${actionName}成功！` });
  } catch (err) {
    console.error('切换锁定状态失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// GET /api/versions/:versionId/terms/:kw/references - 跨版本翻译参考
router.get('/versions/:versionId/terms/:kw/references', authenticateToken, async (req, res) => {
  const { versionId, kw } = req.params;

  try {
    const currentVer = await db.queryOne('SELECT project_id FROM versions WHERE id = $1', [versionId]);
    if (!currentVer) {
      return res.status(404).json({ error: '版本不存在' });
    }
    const projectId = currentVer.project_id;

    const rows = await db.query(
      `SELECT v.version_name, t.zh_cn, t.translations, t.owner, t.updated_at
       FROM terms t
       JOIN versions v ON t.version_id = v.id
       WHERE v.project_id = $1 AND t.kw = $2 AND v.id <> $3
       ORDER BY t.updated_at DESC`,
      [projectId, kw, versionId]
    );

    const results = rows.map(r => ({
      versionName: r.version_name,
      zh_cn: r.zh_cn,
      translations: typeof r.translations === 'string' ? JSON.parse(r.translations) : (r.translations || {}),
      owner: r.owner,
      updatedAt: r.updated_at
    }));

    res.json(results);
  } catch (err) {
    console.error('获取跨版本翻译参考失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// GET /api/terms/:termId/snapshots - 获取单个词条的翻译历史快照列表
router.get('/terms/:termId/snapshots', authenticateToken, async (req, res) => {
  const { termId } = req.params;
  try {
    const snapshots = await db.query(
      `SELECT s.*, u.username as creator_name 
       FROM term_snapshots s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.term_id = $1 
       ORDER BY s.created_at DESC`,
      [termId]
    );

    const formatted = snapshots.map(s => {
      let trans = {};
      try {
        trans = typeof s.translations === 'string' ? JSON.parse(s.translations) : s.translations;
      } catch { }
      return {
        id: s.id,
        termId: s.term_id,
        versionId: s.version_id,
        kw: s.kw,
        zh_cn: s.zh_cn,
        translations: trans,
        createdAt: s.created_at,
        creatorName: s.creator_name || '系统用户'
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('获取词条快照失败:', err);
    res.status(500).json({ error: '服务器内部错误，获取历史记录失败。' });
  }
});

// POST /api/terms/:termId/rollback - 一键回退到指定快照的翻译
router.post('/terms/:termId/rollback', authenticateToken, writeLimiter, async (req, res) => {
  const { termId } = req.params;
  const { snapshotId } = req.body;
  const dbType = getDbType();

  if (!snapshotId) {
    return res.status(400).json({ error: '缺少快照ID (snapshotId)' });
  }

  try {
    if (!(await requireTermOwnership(req.user.id, termId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权回退此词条。' });
    }
    const term = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);
    if (!term) {
      return res.status(404).json({ error: '词条不存在' });
    }

    if (term.is_locked === 1 || term.is_locked === true) {
      return res.status(403).json({ error: 'LOCKED', message: '此词条已被锁定，如需回退请联系管理员解锁！' });
    }

    const snapshot = await db.queryOne('SELECT * FROM term_snapshots WHERE id = $1 AND term_id = $2', [snapshotId, termId]);
    if (!snapshot) {
      return res.status(404).json({ error: '找不到指定的词条历史快照' });
    }

    const newSnapshotId = crypto.randomUUID();
    const currentTransStr = typeof term.translations === 'string' ? term.translations : JSON.stringify(term.translations || {});

    await db.transaction(async (tx) => {
      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), $7)`,
          [newSnapshotId, termId, term.version_id, term.kw, term.zh_cn, currentTransStr, req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO term_snapshots (id, term_id, version_id, kw, zh_cn, translations, created_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, datetime('now'), $7)`,
          [newSnapshotId, termId, term.version_id, term.kw, term.zh_cn, currentTransStr, req.user.id]
        );
      }

      let nextStatus = 'PENDING_REVIEW';
      if (req.user.role === 'admin') {
        nextStatus = 'APPROVED';
      }

      const snapTransStr = typeof snapshot.translations === 'string' ? snapshot.translations : JSON.stringify(snapshot.translations || {});

      if (dbType === 'postgres') {
        await tx.run(
          `UPDATE terms 
           SET kw = $1, zh_cn = $2, translations = $3::jsonb, status = $4, reject_reason = NULL, updated_at = NOW(), updated_by = $5
           WHERE id = $6`,
          [snapshot.kw, snapshot.zh_cn, snapTransStr, nextStatus, req.user.id, termId]
        );
      } else {
        await tx.run(
          `UPDATE terms 
           SET kw = $1, zh_cn = $2, translations = $3, status = $4, reject_reason = NULL, updated_at = datetime('now'), updated_by = $5
           WHERE id = $6`,
          [snapshot.kw, snapshot.zh_cn, snapTransStr, nextStatus, req.user.id, termId]
        );
      }

      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
      const versionObj = await tx.queryOne('SELECT version_name FROM versions WHERE id = $1', [term.version_id]);
      const details = `将词条 [${term.kw}] 的内容回退到了 [${snapshot.created_at}] 的历史版本。`;

      if (dbType === 'postgres') {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (NOW(), $1, $2, '历史回退', $3, $4, $5)`,
          [snapshot.kw, snapshot.zh_cn, details, versionObj ? versionObj.version_name : '', req.user.id]
        );
      } else {
        await tx.run(
          `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           VALUES (datetime('now'), $1, $2, '历史回退', $3, $4, $5)`,
          [snapshot.kw, snapshot.zh_cn, details, versionObj ? versionObj.version_name : '', req.user.id]
        );
      }
    });

    res.json({ message: '成功回退到指定历史快照！', kw: snapshot.kw });
  } catch (err) {
    console.error('词条快照回退失败:', err);
    res.status(500).json({ error: '服务器内部错误，回退操作失败。' });
  }
});

// POST /api/terms/batch-update - 批量设置词条分类字段
router.post('/terms/batch-update', authenticateToken, async (req, res) => {
  const { termIds, updates } = req.body;
  const dbType = getDbType();

  if (!Array.isArray(termIds) || termIds.length === 0 || !updates) {
    return res.status(400).json({ error: '必须包含 termIds 数组和 updates 更新对象' });
  }

  try {
    if (termIds.length > 0 && !(await requireTermOwnership(req.user.id, termIds[0]))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权修改此项目的词条。' });
    }
    let successCount = 0;
    let lockedCount = 0;

    await db.transaction(async (tx) => {
      const placeholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const terms = await tx.query(`SELECT id, is_locked, kw, zh_cn, version_id FROM terms WHERE id IN (${placeholders})`, termIds);

      const validTerms = terms.filter(t => {
        if (t.is_locked === 1 || t.is_locked === true) {
          lockedCount++;
          return false;
        }
        return true;
      });

      if (validTerms.length === 0) {
        return;
      }

      const updatesNormalized = {};
      if (updates.context !== undefined) {
        updatesNormalized.context = updates.context;
      } else if (updates['所在页面'] !== undefined) {
        updatesNormalized.context = updates['所在页面'];
      }

      if (updates.owner !== undefined) {
        updatesNormalized.owner = updates.owner;
      } else if (updates['字号类别'] !== undefined) {
        updatesNormalized.owner = updates['字号类别'];
      }

      const updateFields = [];
      const updateParams = [];
      let idx = 1;

      if (updatesNormalized.context !== undefined) {
        updateFields.push(`context = $${idx++}`);
        updateParams.push(updatesNormalized.context);
      }
      if (updatesNormalized.owner !== undefined) {
        updateFields.push(`owner = $${idx++}`);
        updateParams.push(updatesNormalized.owner);
      }

      if (updateFields.length === 0) return;

      const baseQuery = dbType === 'postgres'
        ? `UPDATE terms SET ${updateFields.join(', ')}, updated_at = NOW(), updated_by = $${idx}`
        : `UPDATE terms SET ${updateFields.join(', ')}, updated_at = datetime('now'), updated_by = $${idx}`;

      updateParams.push(req.user.id);
      const termIdParamIndex = idx + 1;

      for (const t of validTerms) {
        const query = `${baseQuery} WHERE id = $${termIdParamIndex}`;
        await tx.run(query, [...updateParams, t.id]);
        successCount++;
      }

      if (successCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const ver = await tx.queryOne('SELECT version_name FROM versions WHERE id = $1', [validTerms[0].version_id]);
        const verName = ver ? ver.version_name : '未知版本';
        const detailMsg = `批量更新了 ${successCount} 条词条的分类字段 (${Object.keys(updates).join(', ')})。跳过锁定条数: ${lockedCount}。`;

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '批量修改', $1, $2, $3)`,
            [detailMsg, verName, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '批量修改', $1, $2, $3)`,
            [detailMsg, verName, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功批量更新分类字段！已更新: ${successCount} 条，跳过锁定: ${lockedCount} 条。`,
      successCount,
      lockedCount
    });
  } catch (err) {
    console.error('批量修改分类字段失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/terms/batch-copy - 批量复制词条到其他版本
router.post('/terms/batch-copy', authenticateToken, async (req, res) => {
  const { termIds, targetVersionId, duplicateStrategy } = req.body;
  const dbType = getDbType();

  if (!Array.isArray(termIds) || termIds.length === 0 || !targetVersionId || !duplicateStrategy) {
    return res.status(400).json({ error: '必须包含 termIds 数组、targetVersionId 和 duplicateStrategy 策略' });
  }

  const validStrategies = ['overwrite', 'skip'];
  if (!validStrategies.includes(duplicateStrategy)) {
    return res.status(400).json({ error: 'INVALID_STRATEGY', message: '无效的复制策略。' });
  }

  try {
    const targetVer = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [targetVersionId]);
    if (!targetVer) {
      return res.status(404).json({ error: '目标版本不存在' });
    }

    let copyCount = 0;
    let skipCount = 0;
    let overwriteCount = 0;

    await db.transaction(async (tx) => {
      const placeholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const sourceTerms = await tx.query(
        `SELECT kw, context, owner, zh_cn, translations FROM terms WHERE id IN (${placeholders})`,
        termIds
      );

      const existingTerms = await tx.query(
        'SELECT id, kw, is_locked, translations FROM terms WHERE version_id = $1',
        [targetVersionId]
      );

      const existingMap = {};
      existingTerms.forEach(t => {
        existingMap[t.kw] = t;
      });

      for (const term of sourceTerms) {
        const exist = existingMap[term.kw];
        const newId = crypto.randomUUID();

        let transStr = JSON.stringify(parseJsonField(term.translations));

        if (exist) {
          if (duplicateStrategy === 'skip') {
            skipCount++;
            continue;
          } else if (duplicateStrategy === 'overwrite') {
            if (exist.is_locked === 1 || exist.is_locked === true) {
              skipCount++;
              continue;
            }

            await tx.run('DELETE FROM terms WHERE id = $1', [exist.id]);

            if (dbType === 'postgres') {
              await tx.run(
                `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW(), FALSE)`,
                [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
              );
            } else {
              await tx.run(
                `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'), 0)`,
                [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
              );
            }
            overwriteCount++;
          }
        } else {
          if (dbType === 'postgres') {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW(), FALSE)`,
              [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
            );
          } else {
            await tx.run(
              `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, created_at, updated_at, is_locked)
               VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'), 0)`,
              [newId, targetVersionId, term.kw, term.context, term.owner, term.zh_cn, transStr]
            );
          }
          copyCount++;
        }
      }

      const totalMoved = copyCount + overwriteCount;
      if (totalMoved > 0 || skipCount > 0) {
        const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
        const details = `批量从其他版本复制词条到 [${targetVer.version_name}]。成功复制新增: ${copyCount} 条，覆盖已有: ${overwriteCount} 条，跳过（重复/锁定）: ${skipCount} 条。`;

        if (dbType === 'postgres') {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (NOW(), '批量复制', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        } else {
          await tx.run(
            `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
             VALUES (datetime('now'), '批量复制', $1, $2, $3)`,
            [details, targetVer.version_name, req.user.id]
          );
        }
      }
    });

    res.json({
      message: `成功复制词条到版本 [${targetVer.version_name}]！`,
      addedCount: copyCount,
      overwrittenCount: overwriteCount,
      skippedCount: skipCount
    });
  } catch (err) {
    console.error('批量复制到其他版本失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/terms/batch-approve - 批量审核词条工作流 API
router.post('/terms/batch-approve', authenticateToken, async (req, res) => {
  const { termIds, status, rejectReason } = req.body;
  const dbType = getDbType();

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '只有管理员有权审核词条！' });
  }

  if (Array.isArray(termIds) && termIds.length > 0 && !(await requireTermOwnership(req.user.id, termIds[0]))) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '您无权审核此项目的词条。' });
  }

  if (!Array.isArray(termIds) || termIds.length === 0 || !status) {
    return res.status(400).json({ error: '必须包含有效的 termIds 数组和目标审核 status 字段！' });
  }

  const validStatuses = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '非法审核状态！' });
  }

  try {
    await db.transaction(async (tx) => {
      const selectPlaceholders = termIds.map((_, i) => `$${i + 1}`).join(',');
      const candidates = await tx.query(
        `SELECT id, is_locked, kw, zh_cn, version_id FROM terms WHERE id IN (${selectPlaceholders})`,
        termIds
      );

      const validTerms = candidates.filter(t => !(t.is_locked === 1 || t.is_locked === true));

      if (validTerms.length === 0) {
        return;
      }

      const validIds = validTerms.map(t => t.id);
      const reason = status === 'REJECTED' ? (rejectReason || '未填写具体原因') : null;

      const updatePlaceholders = validIds.map((_, i) => `$${i + 4}`).join(',');
      const updateSql = dbType === 'postgres'
        ? `UPDATE terms SET status = $1, reject_reason = $2, updated_at = NOW(), updated_by = $3 WHERE id IN (${updatePlaceholders})`
        : `UPDATE terms SET status = $1, reject_reason = $2, updated_at = datetime('now'), updated_by = $3 WHERE id IN (${updatePlaceholders})`;
      await tx.run(updateSql, [status, reason, req.user.id, ...validIds]);

      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
      const logPlaceholders = validIds.map((_, i) => `$${i + 4}`).join(',');
      const timestampExpr = dbType === 'postgres' ? 'NOW()' : "datetime('now')";
      const detailsPrefix = '审核词条 [';
      const detailsSuffix = `]，结果: [${status}]${status === 'REJECTED' ? `，原因: ${reason}` : ''}`;

      const logSql = `INSERT INTO ${logsTable} (timestamp, kw, chinese, action, details, version_name, user_id)
           SELECT ${timestampExpr}, t.kw, t.zh_cn, '内容审核', $1 || t.kw || $2, COALESCE(v.version_name, ''), $3
           FROM terms t LEFT JOIN versions v ON t.version_id = v.id
           WHERE t.id IN (${logPlaceholders})`;
      await tx.run(logSql, [detailsPrefix, detailsSuffix, req.user.id, ...validIds]);
    });

    res.json({ message: `批量操作成功！已将选中词条设置为 [${status}] 状态。` });
  } catch (err) {
    console.error('批量审核词条失败:', err);
    res.status(500).json({ error: '服务器内部错误，批量审核失败。' });
  }
});


// POST /api/tables/:tableId/sync - Bulk Insert/Update/Delete records for a version
router.post('/tables/:tableId/sync', authenticateToken, writeLimiter, async (req, res) => {
  const { tableId } = req.params;
  const { added = [], updated = [], deletedIds = [] } = req.body;

  try {
    const dbType = getDbType();

    if (!(await requireVersionOwnership(req.user.id, tableId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权修改此数据表。' });
    }

    let successCount = 0;

    await db.transaction(async (tx) => {
      // 1. Delete
      if (deletedIds.length > 0) {
        const placeholders = deletedIds.map((_, i) => `$${i + 1}`).join(',');
        await tx.query(`DELETE FROM terms WHERE id IN (${placeholders}) AND version_id = $${deletedIds.length + 1} AND (is_locked IS NOT TRUE)`, [...deletedIds, tableId]);
      }

      // 2. Insert (Added)
      for (const rec of added) {
        let kwVal = (rec.fields['KW'] || rec.kw || '').trim();
        if (!kwVal) {
          kwVal = `__EMPTY_KW_${crypto.randomUUID()}__`;
        }
        const zhCnVal = (rec.fields['CN（中文）'] || rec.zh_cn || '').trim();
        const contextVal = (rec.fields['所在页面'] || rec.context || '').trim();

        const systemKeys = ['KW', 'CN（中文）', '所在页面', '字号类别'];
        let translationsObj = rec.translations;
        if (!translationsObj || typeof translationsObj !== 'object') {
          translationsObj = {};
          Object.keys(rec.fields || {}).forEach(k => {
            if (!systemKeys.includes(k) && rec.fields[k] !== undefined) {
              translationsObj[k] = rec.fields[k];
            }
          });
        }

        const fieldsStr = JSON.stringify(translationsObj);
        const translationsMetaStr = JSON.stringify(rec.translationsMeta || {});
        const nowStr = new Date().toISOString();

        const lockedFalseVal = dbType === 'postgres' ? false : 0;

        await tx.query(`
          INSERT INTO terms (id, version_id, kw, context, zh_cn, translations, translations_meta, is_locked, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          rec.recordId,
          tableId,
          kwVal,
          contextVal,
          zhCnVal,
          fieldsStr,
          translationsMetaStr,
          lockedFalseVal,
          'DRAFT',
          nowStr,
          nowStr
        ]);
        successCount++;
      }

      // 3. Update (Modified)
      for (const rec of updated) {
        const existing = await tx.queryOne('SELECT kw, zh_cn, context, translations_meta FROM terms WHERE id = $1', [rec.recordId]);
        
        let kwVal = rec.fields && rec.fields['KW'] !== undefined 
          ? rec.fields['KW'].trim() 
          : (rec.kw !== undefined ? rec.kw.trim() : (existing ? existing.kw : ''));

        if (!kwVal) {
          if (existing && existing.kw && existing.kw.startsWith('__EMPTY_KW_')) {
            kwVal = existing.kw;
          } else {
            kwVal = `__EMPTY_KW_${crypto.randomUUID()}__`;
          }
        }

        const zhCnVal = rec.fields && rec.fields['CN（中文）'] !== undefined 
          ? rec.fields['CN（中文）'].trim() 
          : (existing ? existing.zh_cn : '');

        const contextVal = rec.fields && rec.fields['所在页面'] !== undefined 
          ? rec.fields['所在页面'].trim() 
          : (existing ? existing.context || '' : '');

        const systemKeys = ['KW', 'CN（中文）', '所在页面', '字号类别'];
        let translationsObj = rec.translations;
        if (!translationsObj || typeof translationsObj !== 'object') {
          translationsObj = {};
          Object.keys(rec.fields || {}).forEach(k => {
            if (!systemKeys.includes(k) && rec.fields[k] !== undefined) {
              translationsObj[k] = rec.fields[k];
            }
          });
        }

        // Merge with existing translations in database so previous language translations are preserved
        let existingTrans = {};
        if (existing && existing.translations) {
          try {
            existingTrans = typeof existing.translations === 'string' ? JSON.parse(existing.translations) : (existing.translations || {});
          } catch {}
        }
        const finalTranslationsObj = { ...existingTrans, ...translationsObj };
        const fieldsStr = JSON.stringify(finalTranslationsObj);

        let mergedMeta = rec.translationsMeta;
        if (!mergedMeta && existing && existing.translations_meta) {
          try {
            mergedMeta = typeof existing.translations_meta === 'string' ? JSON.parse(existing.translations_meta) : existing.translations_meta;
          } catch {
            mergedMeta = {};
          }
        }
        const translationsMetaStr = JSON.stringify(mergedMeta || {});
        const nowStr = new Date().toISOString();

        await tx.query(`
          UPDATE terms
          SET kw = $1, context = $2, zh_cn = $3, translations = $4, translations_meta = $5, updated_at = $6
          WHERE id = $7 AND version_id = $8 AND (is_locked IS NOT TRUE)
        `, [
          kwVal,
          contextVal,
          zhCnVal,
          fieldsStr,
          translationsMetaStr,
          nowStr,
          rec.recordId,
          tableId
        ]);
        successCount++;
      }
    });

    res.json({ message: '同步成功', updatedRecords: successCount });
  } catch (error) {
    console.error('Batch sync error:', error);
    res.status(500).json({ error: `批量同步数据失败: ${error.message || '未知错误'}` });
  }
});

// DELETE /api/tables/:tableId/clean-empty - 删除空词条 (无KW或无中文)
router.delete('/tables/:tableId/clean-empty', authenticateToken, writeLimiter, async (req, res) => {
  const { tableId } = req.params;

  try {
    if (!(await requireVersionOwnership(req.user.id, tableId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权修改此数据表。' });
    }

    const result = await db.run(`
      DELETE FROM terms
      WHERE version_id = $1
        AND (TRIM(COALESCE(kw, '')) = '' OR TRIM(COALESCE(zh_cn, '')) = '')
        AND (is_locked IS NOT TRUE)
    `, [tableId]);

    const deletedCount = result.changes || 0;

    res.json({ message: `清理完毕，共删除 ${deletedCount} 条空词条`, deletedCount });
  } catch (error) {
    console.error('清理空词条失败:', error);
    res.status(500).json({ error: '服务器内部错误，清理失败。' });
  }
});

// GET /api/tables/:tableId/export-xls - 导出 Excel/CSV 表格数据
router.get('/tables/:tableId/export-xls', authenticateToken, async (req, res) => {
  const { tableId } = req.params;

  try {
    if (!(await requireVersionOwnership(req.user.id, tableId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权导出此数据表。' });
    }

    const version = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [tableId]);
    const terms = await db.query('SELECT * FROM terms WHERE version_id = $1 ORDER BY created_at ASC', [tableId]);

    const TARGET_LANGUAGES = [
      'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）',
      'PT（葡萄牙）', 'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）',
      'TC（繁）', 'DA（丹麦）', 'CZ(捷克)', '瑞典：', '荷兰：', '土耳其：'
    ];

    const headers = ['KW', 'CN（中文）', '所在页面', '字号类别', ...TARGET_LANGUAGES];
    const rows = [headers];

    for (const term of terms) {
      let trans = {};
      try {
        trans = typeof term.translations === 'string' ? JSON.parse(term.translations || '{}') : (term.translations || {});
      } catch {}

      const row = [
        term.kw && term.kw.startsWith('__EMPTY_KW_') ? '' : (term.kw || ''),
        term.zh_cn || '',
        term.context || '',
        ''
      ];

      TARGET_LANGUAGES.forEach(lang => {
        let val = trans[lang] || '';
        if (!val) {
          const key = Object.keys(trans).find(k => k === lang || k.includes(lang.slice(0, 2)));
          if (key) val = trans[key];
        }
        row.push(val || '');
      });

      rows.push(row);
    }

    const csvContent = '\ufeff' + rows.map(r => 
      r.map(cell => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\r\n');

    const fileName = encodeURIComponent(`GlossaHub_${version?.version_name || tableId}_Export.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`);
    res.send(csvContent);
  } catch (error) {
    console.error('导出表格失败:', error);
    res.status(500).json({ error: '服务器内部错误，导出失败。' });
  }
});

module.exports = router;
