const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');

describe('Term Management & Concurrency Control (/api/terms, /api/tables)', () => {
  let adminToken = '';
  const testVersionId = 'ver-unit-test-' + Date.now();
  const testTermId = 'term-unit-test-' + Date.now();
  const testVersionName = '单元测试表_' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Create a dummy version and term in the test DB
    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, datetime('now'))",
      [testVersionId, testVersionName]
    );

    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_TEST_TERM', '测试页面', '标题', '测试词条中文', '{"EN（英文）":"Test Term"}', '{}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
      [testTermId, testVersionId]
    );
  });

  it('should fetch records for a given version table', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.total).toBeDefined();
    const term = res.body.records.find(t => t.recordId === testTermId);
    expect(term).toBeDefined();
    expect(term.fields['CN（中文）']).toBe('测试词条中文');
  });

  it('should lock and unlock a term', async () => {
    // Lock term
    const lockRes = await request(app)
      .put(`/api/terms/${testTermId}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isLocked: true });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.is_locked).toBe(1);

    // Editing a locked term should be rejected
    const editRes = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kw: 'KW_TEST_TERM',
        zh_cn: '尝试修改锁定词条',
        oldUpdatedAt: new Date().toISOString()
      });

    expect(editRes.status).toBe(403);
    expect(editRes.body.error).toBe('LOCKED');

    // Unlock term
    const unlockRes = await request(app)
      .put(`/api/terms/${testTermId}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isLocked: false });

    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.is_locked).toBe(0);
  });

  it('should handle optimistic concurrency conflict when oldUpdatedAt does not match', async () => {
    const res = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kw: 'KW_TEST_TERM',
        zh_cn: '并发检验中文',
        oldUpdatedAt: '2020-01-01T00:00:00.000Z'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONCURRENCY_CONFLICT');
  });

  it('should allow clearing context and owner fields when updated with empty strings', async () => {
    const fetchRes = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const currentTerm = fetchRes.body.records.find(t => t.recordId === testTermId);

    const editRes = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kw: 'KW_TEST_TERM',
        zh_cn: '测试词条中文',
        context: '',
        owner: '',
        oldUpdatedAt: currentTerm.updatedAt
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.context).toBe('');
    expect(editRes.body.owner).toBe('');
  });

  it('should support sorting records by updated_at and created_at', async () => {
    // Add another term with different timestamp
    const term2Id = 'term-sort-test-' + Date.now();
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_LATEST_UPDATED', '页面2', '副标题', '最新更新词条', '{}', '{}', '2026-01-01 10:00:00', '2026-12-31 23:59:59', 0, 'APPROVED')`,
      [term2Id, testVersionId]
    );

    // Test sortBy=updated_at
    const resUpdate = await request(app)
      .get(`/api/tables/${testVersionId}/records?sortBy=updated_at&sortOrder=desc`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.records[0].recordId).toBe(term2Id);

    // Test sortBy=created_at (ascending)
    const resCreate = await request(app)
      .get(`/api/tables/${testVersionId}/records?sortBy=created_at&sortOrder=asc`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resCreate.status).toBe(200);
    expect(resCreate.body.records[0].recordId).toBe(term2Id); // 2026-01-01 is earlier than Date.now()
  });

  it('should place copied terms at the end with higher sort_order in batch-copy', async () => {
    const targetVersionId = 'ver-copy-target-' + Date.now();
    const targetVersionName = '复制目标测试表_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await db.run(
      "INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, datetime('now'))",
      [targetVersionId, targetVersionName]
    );

    // Initial term in target table with sort_order = 1
    const initialTermId = 'term-initial-target-' + Date.now();
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, sort_order, status)
       VALUES ($1, $2, 'KW_INITIAL', '页面', '标题', '初始词条', '{}', '{}', datetime('now'), datetime('now'), 0, 1, 'APPROVED')`,
      [initialTermId, targetVersionId]
    );

    // Perform batch copy of testTermId to targetVersionId
    const copyRes = await request(app)
      .post('/api/terms/batch-copy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        termIds: [testTermId],
        targetVersionId,
        duplicateStrategy: 'skip'
      });

    expect(copyRes.status).toBe(200);
    expect(copyRes.body.addedCount).toBe(1);

    // Fetch records of target table
    const targetRecordsRes = await request(app)
      .get(`/api/tables/${targetVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(targetRecordsRes.status).toBe(200);
    // Initial term should remain at index 0, and copied term should be at index 1 (at the end)
    expect(targetRecordsRes.body.records[0].fields.KW).toBe('KW_INITIAL');
    expect(targetRecordsRes.body.records[1].fields.KW).toBe('KW_TEST_TERM');
  });

  describe('Batch Clear Translations (/api/terms/batch-clear-translations)', () => {
    const clearTestTerm1 = 'term-clear-1-' + Date.now();
    const clearTestTerm2 = 'term-clear-2-' + Date.now();
    const lockedClearTerm = 'term-clear-locked-' + Date.now();

    beforeAll(async () => {
      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_CLEAR_1', '清空页面1', '字号A', '保留中文1', '{"EN（英文）":"Clear Me 1","FR（法）":"Effacer 1"}', '{"EN（英文）":"ai"}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
        [clearTestTerm1, testVersionId]
      );
      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_CLEAR_2', '清空页面2', '字号B', '保留中文2', '{"EN（英文）":"Clear Me 2","DE（德）":"Löschen 2"}', '{"DE（德）":"tm"}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
        [clearTestTerm2, testVersionId]
      );
      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_CLEAR_LOCKED', '锁定页面', '字号C', '锁定中文', '{"EN（英文）":"Locked English"}', '{}', datetime('now'), datetime('now'), 1, 'APPROVED')`,
        [lockedClearTerm, testVersionId]
      );
    });

    it('should reject requests with empty termIds with 400', async () => {
      const res = await request(app)
        .post('/api/terms/batch-clear-translations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ termIds: [] });

      expect(res.status).toBe(400);
    });

    it('should clear translations while preserving Chinese and other fields, skipping locked terms', async () => {
      const res = await request(app)
        .post('/api/terms/batch-clear-translations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ termIds: [clearTestTerm1, clearTestTerm2, lockedClearTerm] });

      expect(res.status).toBe(200);
      expect(res.body.successCount).toBe(2);
      expect(res.body.lockedCount).toBe(1);

      // Verify term 1 and 2 in DB
      const r1 = await db.queryOne('SELECT * FROM terms WHERE id = $1', [clearTestTerm1]);
      expect(r1.zh_cn).toBe('保留中文1');
      expect(r1.kw).toBe('KW_CLEAR_1');
      expect(r1.context).toBe('清空页面1');
      expect(r1.owner).toBe('字号A');
      const trans1 = typeof r1.translations === 'string' ? JSON.parse(r1.translations) : r1.translations;
      expect(Object.keys(trans1).length).toBe(0);

      // Verify locked term was NOT cleared
      const rLocked = await db.queryOne('SELECT * FROM terms WHERE id = $1', [lockedClearTerm]);
      const transLocked = typeof rLocked.translations === 'string' ? JSON.parse(rLocked.translations) : rLocked.translations;
      expect(transLocked['EN（英文）']).toBe('Locked English');
    });
  });

  describe('Search Functionality (/api/tables/:tableId/records?search=...)', () => {
    const searchTermId = 'term-search-test-' + Date.now();

    beforeAll(async () => {
      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_SEARCH_UNIT', '搜索测试页面', '大标题', '精准搜索中文', '{"EN（英文）":"Search Target"}', '{}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
        [searchTermId, testVersionId]
      );
    });

    it('should search with leading/trailing spaces correctly', async () => {
      const res = await request(app)
        .get(`/api/tables/${testVersionId}/records?search=${encodeURIComponent(' 精准搜索 ')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.records.length).toBeGreaterThanOrEqual(1);
      expect(res.body.records.some(r => r.recordId === searchTermId)).toBe(true);
    });

    it('should search by owner (字号类别) column', async () => {
      const res = await request(app)
        .get(`/api/tables/${testVersionId}/records?search=${encodeURIComponent('大标题')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.records.some(r => r.recordId === searchTermId)).toBe(true);
    });

    it('should support multi-token space-separated search', async () => {
      const res = await request(app)
        .get(`/api/tables/${testVersionId}/records?search=${encodeURIComponent('精准 页面')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.records.some(r => r.recordId === searchTermId)).toBe(true);
    });

    it('should escape wildcard underscores properly', async () => {
      const res = await request(app)
        .get(`/api/tables/${testVersionId}/records?search=${encodeURIComponent('KW_SEARCH_UNIT')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.records.some(r => r.recordId === searchTermId)).toBe(true);
    });
  });

  describe('Untranslated Filter (/api/tables/:tableId/records?untranslated=true)', () => {
    const fullTermId = 'term-full-trans-' + Date.now();
    const untranslatedTermId = 'term-partial-trans-' + Date.now();

    beforeAll(async () => {
      // Fetch active languages for test project
      const langRows = await db.query(
        "SELECT lang_name FROM languages WHERE project_id = 'proj-default' ORDER BY display_order ASC"
      );
      const fullTranslations = {};
      langRows.forEach(l => {
        fullTranslations[l.lang_name] = `Translated ${l.lang_name}`;
      });

      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_FULL_TRANS', '页面1', '字号1', '完全翻译词条', $3, '{}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
        [fullTermId, testVersionId, JSON.stringify(fullTranslations)]
      );

      await db.run(
        `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
         VALUES ($1, $2, 'KW_UNTRANS', '页面2', '字号2', '未翻译词条', '{}', '{}', datetime('now'), datetime('now'), 0, 'APPROVED')`,
        [untranslatedTermId, testVersionId]
      );
    });

    it('should only return records that have missing translations when untranslated=true', async () => {
      const res = await request(app)
        .get(`/api/tables/${testVersionId}/records?untranslated=true`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const returnedIds = res.body.records.map(r => r.recordId);
      expect(returnedIds).toContain(untranslatedTermId);
      expect(returnedIds).not.toContain(fullTermId);
    });
  });
});

