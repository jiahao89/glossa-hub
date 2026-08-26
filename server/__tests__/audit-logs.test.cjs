const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db, getDbType } = require('../config/db.cjs');

describe('Audit Logging Verification (/api/logs, /api/terms, /api/tables/sync)', () => {
  let adminToken = '';
  const testVersionId = 'ver-audit-test-' + Date.now();
  const testTermId = 'term-audit-test-' + Date.now();
  const testVersionName = '审计测试版本大表_' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Create test version
    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, datetime('now'))",
      [testVersionId, testVersionName]
    );

    // Create test term
    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_AUDIT_LOG_TEST', '设置页', '标题', '审计测试原词', '{"EN（英文）":"Initial English"}', '{}', datetime('now'), datetime('now'), 0, 'DRAFT')`,
      [testTermId, testVersionId]
    );
  });

  it('should record audit log when modifying a term via PUT /api/terms/:termId', async () => {
    // Fetch current updatedAt
    const fetchRes = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const term = fetchRes.body.records.find(t => t.recordId === testTermId);

    // Update term
    const editRes = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kw: 'KW_AUDIT_LOG_TEST',
        zh_cn: '审计测试修改后中文',
        translations: { 'EN（英文）': 'Updated English Log Test' },
        oldUpdatedAt: term.updatedAt
      });
    expect(editRes.status).toBe(200);

    // Verify log exists
    const logsRes = await request(app)
      .get('/api/logs?search=KW_AUDIT_LOG_TEST')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.logs.length).toBeGreaterThan(0);

    const log = logsRes.body.logs.find(l => l.kw === 'KW_AUDIT_LOG_TEST');
    expect(log).toBeDefined();
    expect(log.action).toBe('修改词条');
    expect(log.version).toBe(testVersionName);
  });

  it('should record audit log when batch syncing via POST /api/tables/:tableId/sync', async () => {
    const syncAdded = [
      {
        fields: {
          KW: 'KW_SYNC_ADD_1',
          'CN（中文）': '同步新增词条1',
          'EN（英文）': 'Sync Added 1'
        }
      }
    ];

    const syncRes = await request(app)
      .post(`/api/tables/${testVersionId}/sync`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ added: syncAdded, updated: [], deletedIds: [] });
    expect(syncRes.status).toBe(200);

    // Verify log exists
    const logsRes = await request(app)
      .get('/api/logs?search=KW_SYNC_ADD_1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);

    const log = logsRes.body.logs.find(l => l.kw === 'KW_SYNC_ADD_1');
    expect(log).toBeDefined();
    expect(log.action).toBe('新增词条');
  });

  it('should record audit log when cleaning empty terms via DELETE /api/tables/:tableId/clean-empty', async () => {
    // Insert an empty term
    const emptyTermId = 'empty-term-' + Date.now();
    await db.run(
      `INSERT INTO terms (id, version_id, kw, zh_cn, translations, updated_at, is_locked)
       VALUES ($1, $2, '', '', '{}', datetime('now'), 0)`,
      [emptyTermId, testVersionId]
    );

    const cleanRes = await request(app)
      .delete(`/api/tables/${testVersionId}/clean-empty`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cleanRes.status).toBe(200);
    expect(cleanRes.body.deletedCount).toBeGreaterThanOrEqual(1);

    // Verify log exists
    const logsRes = await request(app)
      .get(`/api/logs?version=${encodeURIComponent(testVersionName)}&action=${encodeURIComponent('数据清理')}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.logs.length).toBeGreaterThan(0);
    expect(logsRes.body.logs[0].action).toBe('数据清理');
  });
});
