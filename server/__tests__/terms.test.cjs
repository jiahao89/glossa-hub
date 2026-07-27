const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');

describe('Term Management & Concurrency Control (/api/terms, /api/tables)', () => {
  let adminToken = '';
  const testVersionId = 'ver-unit-test-' + Date.now();
  const testTermId = 'term-unit-test-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Create a dummy version and term in the test DB
    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', '单元测试表', datetime('now'))",
      [testVersionId]
    );

    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_TEST_TERM', '测试页面', '标题', '测试词条中文', '{"EN（英文）":"Test Term"}', '{}', datetime('now'), 0, 'APPROVED')`,
      [testTermId, testVersionId]
    );
  });

  it('should fetch records for a given version table', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const term = res.body.find(t => t.recordId === testTermId);
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
});
