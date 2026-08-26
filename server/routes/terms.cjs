const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireTermOwnership, requireVersionOwnership } = require('../middleware/auth.cjs');
const { writeLimiter } = require('../middleware/rateLimiters.cjs');
const { backupToRecycleBin } = require('../services/recycleBin.cjs');
const { parseJsonField } = require('../utils/jsonFields.cjs');
const { TARGET_LANGUAGES, LEGACY_TO_NEW_LANG_MAP } = require('../config/constants.cjs');
const { createAuditLog } = require('../services/auditLogger.cjs');
const ExcelJS = require('exceljs');

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

    const sortBy = req.query.sortBy || 'default';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let orderByClause = 'ORDER BY sort_order ASC, created_at ASC, id ASC';
    if (sortBy === 'updated_at' || sortBy === 'updatedAt') {
      orderByClause = `ORDER BY COALESCE(updated_at, created_at, '') ${sortOrder}, id ${sortOrder}`;
    } else if (sortBy === 'created_at' || sortBy === 'createdAt') {
      orderByClause = `ORDER BY COALESCE(created_at, updated_at, '') ${sortOrder}, id ${sortOrder}`;
    } else if (sortBy === 'kw' || sortBy === 'KW') {
      orderByClause = `ORDER BY kw ${sortOrder}, id ${sortOrder}`;
    } else if (sortBy === 'zh_cn' || sortBy === 'zhCn') {
      orderByClause = `ORDER BY zh_cn ${sortOrder}, id ${sortOrder}`;
    } else if (sortBy === 'status') {
      orderByClause = `ORDER BY status ${sortOrder}, id ${sortOrder}`;
    }

    const countQuery = `SELECT COUNT(*) as total FROM terms ${whereClause}`;
    const dataQuery = `SELECT * FROM terms ${whereClause} ${orderByClause} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
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
           WHERE id = $9 AND date_trunc('ms', updated_at) = date_trunc('ms', $10::timestamptz) AND is_locked IS NOT TRUE`,
          [finalKw, finalContext, finalOwner, finalZhCn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, req.user.id, termId, oldUpdatedAt]
        );
      } else {
        const nowIso = new Date().toISOString();
        return await tx.run(
          `UPDATE terms
           SET kw = $1, context = $2, owner = $3, zh_cn = $4, translations = $5, translations_meta = $6, status = $7, reject_reason = NULL, updated_at = $8, updated_by = $9
           WHERE id = $10 AND updated_at = $11 AND is_locked != 1`,
          [finalKw, finalContext, finalOwner, finalZhCn, updatedTrans, JSON.stringify(translationsMeta || {}), nextStatus, nowIso, req.user.id, termId, oldUpdatedAt]
        );
      }
    });

    const affectedRows = updateResult.changes || 0;
    if (affectedRows === 0) {
      // The UPDATE may have missed for two reasons:
      //   (a) optimistic-lock mismatch (someone else edited since this client fetched),
      //   (b) the term was locked concurrently by an admin/owner.
      // We re-read to tell them apart and return the appropriate status code so
      // the UI can show the right recovery hint.
      const fresh = await db.queryOne('SELECT is_locked FROM terms WHERE id = $1', [termId]);
      if (fresh && (fresh.is_locked === 1 || fresh.is_locked === true)) {
        return res.status(403).json({ error: 'LOCKED', message: '该词条目前已被锁定，无法修改。如需变更请联系管理员解锁！' });
      }
      return res.status(409).json({ error: 'CONCURRENCY_CONFLICT', message: '该词条已被其他人修改，请刷新后重试。' });
    }

    const newTerm = await db.queryOne('SELECT * FROM terms WHERE id = $1', [termId]);

    // 记录审计修改日志
    try {
      const ver = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [term.version_id]);
      const oldTrans = parseJsonField(term.translations);
      const newTrans = parseJsonField(newTerm.translations);
      const changedLangs = Object.keys({ ...oldTrans, ...newTrans }).filter(k => (oldTrans[k] || '') !== (newTrans[k] || ''));

      let detailsStr = '';
      if (changedLangs.length === 1) {
        const lang = changedLangs[0];
        detailsStr = JSON.stringify({
          field: lang,
          oldVal: oldTrans[lang] || '',
          newVal: newTrans[lang] || ''
        });
      } else if (changedLangs.length > 1) {
        detailsStr = `修改了 ${changedLangs.length} 个语种译文 (${changedLangs.join(', ')})`;
      } else if (isZhChanged) {
        detailsStr = `修改中文源文: [${term.zh_cn}] -> [${finalZhCn}]`;
      } else if (isKwChanged) {
        detailsStr = `修改 KW: [${term.kw}] -> [${finalKw}]`;
      } else {
        detailsStr = `修改词条属性 (页面: ${finalContext}, 负责人: ${finalOwner})`;
      }

      await createAuditLog({
        kw: finalKw,
        chinese: finalZhCn,
        action: '修改词条',
        details: detailsStr,
        versionName: ver?.version_name || '',
        userId: req.user.id
      });
    } catch (logErr) {
      console.error('[terms.put] 记录修改日志异常:', logErr);
    }

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

// POST /api/terms/batch-delete - 批量软删除词条 (走回收站, 30 天可恢复)
//
// 行为:
//   1. 验证 termIds 全部存在且属于同一项目
//   2. 跳过已锁定的词条 (lockedSkipped 计数)
//   3. 每个成功删除的词条写入 recycle_bin (含完整 term + snapshots)
//   4. 在事务中硬删 terms 行
//   5. 写一条 '批量删除' 审计日志
// Owner / Editor 角色可调; Viewer 拒绝 (权限继承自 batch-update 的 requireTermOwnership)
router.post('/terms/batch-delete', authenticateToken, writeLimiter, async (req, res) => {
  const { termIds } = req.body;
  const dbType = getDbType();

  if (!Array.isArray(termIds) || termIds.length === 0) {
    return res.status(400).json({ error: '必须包含 termIds 数组' });
  }

  // 防止误操作: 限制单次最多 200 条
  if (termIds.length > 200) {
    return res.status(400).json({ error: '单次最多删除 200 条, 请分批操作' });
  }

  try {
    // RBAC: 用第一条做抽样检查 (与 batch-update 同样的策略)
    if (!(await requireTermOwnership(req.user.id, termIds[0]))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权删除此项目的词条。' });
    }

    const placeholders = termIds.map((_, i) => `$${i + 1}`).join(',');
    const terms = await db.query(
      `SELECT id, kw, zh_cn, is_locked FROM terms WHERE id IN (${placeholders})`,
      termIds
    );

    let deletedCount = 0;
    let lockedSkipped = 0;
    const skippedLockedIds = [];
    const deletedKwList = [];

    for (const t of terms) {
      if (t.is_locked === 1 || t.is_locked === true) {
        lockedSkipped++;
        skippedLockedIds.push(t.id);
        continue;
      }
      // 走回收站: 备份完整 term + snapshots
      const entityName = t.zh_cn || t.kw || t.id;
      try {
        await backupToRecycleBin('term', t.id, entityName, req.user.id);
      } catch (e) {
        console.error(`[batch-delete] backupToRecycleBin 失败, termId=${t.id}:`, e.message);
        // 继续处理下一个, 不阻塞整体
        continue;
      }
      // 硬删 term 行 (事务外, 因为 backupToRecycleBin 已独立写 recycle_bin)
      if (dbType === 'postgres') {
        await db.run('DELETE FROM terms WHERE id = $1', [t.id]);
      } else {
        await db.run('DELETE FROM terms WHERE id = $1', [t.id]);
      }
      deletedCount++;
      deletedKwList.push(t.kw);
    }

    // 写一条审计日志
    if (deletedCount > 0) {
      const details = `批量软删除 ${deletedCount} 条词条 (已送入回收站, 30 天后清理): ${deletedKwList.slice(0, 10).join(', ')}${deletedKwList.length > 10 ? ` ... 等 ${deletedKwList.length} 条` : ''}`;
      const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
      if (dbType === 'postgres') {
        await db.run(
          `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
           VALUES (NOW(), '批量删除', $1, $2, $3)`,
          [details, '', req.user.id]
        );
      } else {
        await db.run(
          `INSERT INTO ${logsTable} (timestamp, action, details, version_name, user_id)
           VALUES (datetime('now'), '批量删除', $1, $2, $3)`,
          [details, '', req.user.id]
        );
      }
    }

    res.json({
      message: `成功删除 ${deletedCount} 条词条 (送入回收站, 30 天内可恢复)`,
      deletedCount,
      lockedSkipped,
      skippedLockedIds,
    });
  } catch (err) {
    console.error('批量删除词条失败:', err);
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
  const { added = [], updated = [], deletedIds = [], reorder = [] } = req.body;

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

        // Auto-assign sort_order: use provided value, or compute next max
        let sortOrder = rec.sortOrder;
        if (sortOrder === undefined || sortOrder === null) {
          const maxRow = await tx.queryOne(
            'SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM terms WHERE version_id = $1',
            [tableId]
          );
          sortOrder = (parseInt(maxRow?.max_sort || 0, 10)) + 1;
        }

        await tx.query(`
          INSERT INTO terms (id, version_id, kw, context, zh_cn, translations, translations_meta, is_locked, status, sort_order, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (version_id, kw) DO UPDATE SET
            context = EXCLUDED.context,
            zh_cn = EXCLUDED.zh_cn,
            translations = EXCLUDED.translations,
            translations_meta = EXCLUDED.translations_meta,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at
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
          sortOrder,
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
        // Use parseJsonField so a corrupted JSON column is reported (logged) instead of silently swallowed.
        let existingTrans = parseJsonField(existing && existing.translations);
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
          SET kw = $1, context = $2, zh_cn = $3, translations = $4, translations_meta = $5, updated_at = $6${rec.sortOrder !== undefined ? ', sort_order = $9' : ''}
          WHERE id = $7 AND version_id = $8 AND (is_locked IS NOT TRUE)
        `, rec.sortOrder !== undefined ? [
          kwVal,
          contextVal,
          zhCnVal,
          fieldsStr,
          translationsMetaStr,
          nowStr,
          rec.recordId,
          tableId,
          rec.sortOrder
        ] : [
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
      // 4. Reorder (sort_order only updates for unchanged records)
      for (const rec of reorder) {
        if (rec.recordId && rec.sortOrder !== undefined) {
          await tx.query(
            'UPDATE terms SET sort_order = $1 WHERE id = $2 AND version_id = $3',
            [rec.sortOrder, rec.recordId, tableId]
          );
        }
      }

      // 5. 记录同步审计日志
      try {
        const ver = await tx.queryOne('SELECT version_name FROM versions WHERE id = $1', [tableId]);
        const verName = ver ? ver.version_name : '';

        if (added.length === 1) {
          const a = added[0];
          const aKw = a.fields?.['KW'] || a.kw || '';
          const aZh = a.fields?.['CN（中文）'] || a.zh_cn || '';
          await createAuditLog({
            kw: aKw,
            chinese: aZh,
            action: '新增词条',
            details: `新增词条 [${aKw}] (${aZh})`,
            versionName: verName,
            userId: req.user.id,
            tx
          });
        } else if (added.length > 1) {
          const firstFew = added.slice(0, 5).map(i => (i.fields?.['KW'] || i.kw)).filter(Boolean).join(', ');
          await createAuditLog({
            action: '批量新增',
            details: `批量新增了 ${added.length} 条词条${firstFew ? ` (${firstFew} 等)` : ''}`,
            versionName: verName,
            userId: req.user.id,
            tx
          });
        }

        if (updated.length === 1) {
          const u = updated[0];
          const uKw = u.fields?.['KW'] || u.kw || '';
          const uZh = u.fields?.['CN（中文）'] || u.zh_cn || '';
          await createAuditLog({
            kw: uKw,
            chinese: uZh,
            action: '修改词条',
            details: `同步更新词条 [${uKw}] 译文`,
            versionName: verName,
            userId: req.user.id,
            tx
          });
        } else if (updated.length > 1) {
          const isAi = updated.some(u => {
            const m = u.translationsMeta || {};
            return Object.values(m).some(v => v === 'ai');
          });
          const isTm = updated.some(u => {
            const m = u.translationsMeta || {};
            return Object.values(m).some(v => v === 'tm');
          });
          const actionName = isAi ? 'AI批量翻译' : (isTm ? '翻译继承' : '批量更新');
          await createAuditLog({
            action: actionName,
            details: `${actionName}更新了 ${updated.length} 条词条数据`,
            versionName: verName,
            userId: req.user.id,
            tx
          });
        }

        if (deletedIds.length > 0) {
          await createAuditLog({
            action: '批量删除',
            details: `同步删除了 ${deletedIds.length} 条词条`,
            versionName: verName,
            userId: req.user.id,
            tx
          });
        }
      } catch (logErr) {
        console.error('[sync] 记录审计日志异常:', logErr);
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

    if (deletedCount > 0) {
      try {
        const ver = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [tableId]);
        await createAuditLog({
          action: '数据清理',
          details: `清理了数据表中的 ${deletedCount} 条空词条 (无 KW 或无中文)`,
          versionName: ver ? ver.version_name : '',
          userId: req.user.id
        });
      } catch (logErr) {
        console.error('[clean-empty] 记录日志异常:', logErr);
      }
    }

    res.json({ message: `清理完毕，共删除 ${deletedCount} 条空词条`, deletedCount });
  } catch (error) {
    console.error('清理空词条失败:', error);
    res.status(500).json({ error: '服务器内部错误，清理失败。' });
  }
});

// ALL (GET/POST) /api/tables/:tableId/export-xls - 导出 Excel (.xlsx) 表格数据 (支持高亮标记)
router.all('/tables/:tableId/export-xls', authenticateToken, async (req, res) => {
  const { tableId } = req.params;
  const highlightIdsList = req.body?.highlightIds || (req.query?.highlightIds ? req.query.highlightIds.split(',') : []);
  const highlightIds = new Set(highlightIdsList);
  const modifiedCells = req.body?.modifiedCells || {};

  try {
    if (!(await requireVersionOwnership(req.user.id, tableId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权导出此数据表。' });
    }

    const version = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [tableId]);
    const terms = await db.query('SELECT * FROM terms WHERE version_id = $1 ORDER BY sort_order ASC, created_at ASC', [tableId]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GlossaHub';
    workbook.created = new Date();

    const sheetName = (version?.version_name || tableId || 'Sheet1').slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
    const worksheet = workbook.addWorksheet(sheetName);

    const headers = ['KW', 'CN（中文）', '所在页面', '字号类别', ...TARGET_LANGUAGES];
    const headerRow = worksheet.addRow(headers);

    // Header styling
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' } // Dark gray/slate
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    });

    const ALIASES_BY_CANONICAL = Object.entries(LEGACY_TO_NEW_LANG_MAP).reduce((acc, [legacy, canonical]) => {
      (acc.get(canonical) || acc.set(canonical, []).get(canonical)).push(legacy);
      return acc;
    }, new Map());

    for (const term of terms) {
      const trans = parseJsonField(term.translations);

      const rowValues = [
        term.kw && term.kw.startsWith('__EMPTY_KW_') ? '' : (term.kw || ''),
        term.zh_cn || '',
        term.context || '',
        term.owner || ''
      ];

      TARGET_LANGUAGES.forEach(lang => {
        let val = trans[lang];
        if (val === undefined || val === null || String(val).trim() === '') {
          const aliases = ALIASES_BY_CANONICAL.get(lang);
          if (aliases) {
            for (const alias of aliases) {
              const candidate = trans[alias];
              if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
                val = candidate;
                break;
              }
            }
          }
        }
        if (val === undefined || val === null) val = '';
        rowValues.push(val);
      });

      const row = worksheet.addRow(rowValues);
      row.height = 20;

      // Determine highlight status
      const termMod = modifiedCells[term.id] || modifiedCells[term.kw];
      const isHighlighted = highlightIds.has(term.id) || highlightIds.has(term.kw) || !!termMod;

      const isAdded = termMod?.isAdded;

      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', wrapText: false };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };

        if (isHighlighted) {
          if (isAdded) {
            // Light green highlight for newly added terms
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFDCFCE7' } // Tailwind green-100
            };
          } else if (termMod && typeof termMod === 'object') {
            // Check specific language or general modification
            if (colNumber >= 5) {
              const lang = TARGET_LANGUAGES[colNumber - 5];
              if (termMod[lang] || termMod.isModified) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFFEF3C7' } // Tailwind amber/yellow-100
                };
              }
            } else if (termMod.isModified) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFEF3C7' }
              };
            }
          } else {
            // General highlight
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEF3C7' }
            };
          }
        }
      });
    }

    // Adjust column widths
    worksheet.columns.forEach((column, index) => {
      let maxLen = headers[index] ? headers[index].length * 2 : 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const str = cell.value ? String(cell.value) : '';
        const len = str.length;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(Math.max(maxLen + 3, 12), 45);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = encodeURIComponent(`GlossaHub_${version?.version_name || tableId}_Export.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`);
    res.send(buffer);
  } catch (error) {
    console.error('导出 Excel 表格失败:', error);
    res.status(500).json({ error: '服务器内部错误，导出失败。' });
  }
});

// ALL (GET/POST) /api/tables/:tableId/export-csv - 导出 CSV 表格数据 (删除“所在页面”和“字号类别”列)
router.all('/tables/:tableId/export-csv', authenticateToken, async (req, res) => {
  const { tableId } = req.params;

  try {
    if (!(await requireVersionOwnership(req.user.id, tableId))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '您无权导出此数据表。' });
    }

    const version = await db.queryOne('SELECT version_name FROM versions WHERE id = $1', [tableId]);
    const terms = await db.query('SELECT * FROM terms WHERE version_id = $1 ORDER BY sort_order ASC, created_at ASC', [tableId]);

    // CSV 表头：删除“所在页面”和“字号类别”列，其他字段和顺序不变
    const headers = ['KW', 'CN（中文）', ...TARGET_LANGUAGES];

    const ALIASES_BY_CANONICAL = Object.entries(LEGACY_TO_NEW_LANG_MAP).reduce((acc, [legacy, canonical]) => {
      (acc.get(canonical) || acc.set(canonical, []).get(canonical)).push(legacy);
      return acc;
    }, new Map());

    const escapeCsvCell = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [];
    lines.push(headers.map(escapeCsvCell).join(','));

    for (const term of terms) {
      const trans = parseJsonField(term.translations);
      const rowValues = [
        term.kw && term.kw.startsWith('__EMPTY_KW_') ? '' : (term.kw || ''),
        term.zh_cn || ''
      ];

      TARGET_LANGUAGES.forEach(lang => {
        let val = trans[lang];
        if (val === undefined || val === null || String(val).trim() === '') {
          const aliases = ALIASES_BY_CANONICAL.get(lang);
          if (aliases) {
            for (const alias of aliases) {
              const candidate = trans[alias];
              if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
                val = candidate;
                break;
              }
            }
          }
        }
        if (val === undefined || val === null) val = '';
        rowValues.push(val);
      });

      lines.push(rowValues.map(escapeCsvCell).join(','));
    }

    // UTF-8 BOM (\uFEFF) for Excel compatibility
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const rawFileName = `GlossaHub_${version?.version_name || tableId}_Export.csv`;
    const fileName = encodeURIComponent(rawFileName);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`);
    res.send(csvContent);
  } catch (error) {
    console.error('导出 CSV 表格失败:', error);
    res.status(500).json({ error: '服务器内部错误，导出 CSV 失败。' });
  }
});

module.exports = router;

