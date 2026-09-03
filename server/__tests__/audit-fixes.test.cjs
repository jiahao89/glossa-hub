const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db, getDbType } = require('../config/db.cjs');

describe('Code Review Audit Fixes Verification', () => {
  let adminToken = '';
  let viewerToken = '';
  const testVersionId = 'ver-audit-' + Date.now();
  const testTermId = 'term-audit-' + Date.now();
  const testTerm2Id = 'term-audit-2-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    // Login as admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Login as viewer
    const viewerRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'viewer1', password: 'viewer123' });
    viewerToken = viewerRes.body.token;

    // Create test version with unique name
    const nowExpr = getDbType() === 'postgres' ? 'NOW()' : "datetime('now')";
    const testVersionName = '审核修复测试表_' + Date.now();
    await db.run(
      `INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, ${nowExpr})`,
      [testVersionId, testVersionName]
    );

    // Create test term with multiple languages
    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, sort_order, created_at, updated_at, is_locked)
       VALUES ($1, $2, 'KW_AUDIT_FIX', '主页', '王赵云', '设置', '{"EN（英文）":"Settings","FR（法）":"Paramètres","DE（德）":"Einstellungen"}', '{"EN（英文）":"tm","FR（法）":"ai"}', 10, ${nowExpr}, ${nowExpr}, 0)`,
      [testTermId, testVersionId]
    );

    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, sort_order, created_at, updated_at, is_locked)
       VALUES ($1, $2, 'KW_AUDIT_FIX_2', '列表', '王赵云', '退出', '{"EN（英文）":"Exit"}', '{}', 20, ${nowExpr}, ${nowExpr}, 0)`,
      [testTerm2Id, testVersionId]
    );
  });

  describe('Fix 1: Data Loss in /api/tables/:tableId/sync', () => {
    it('should NOT wipe other language translations when updating a single language', async () => {
      // Send sync update that only provides ES (西班牙)
      const res = await request(app)
        .post(`/api/tables/${testVersionId}/sync`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          updated: [
            {
              recordId: testTermId,
              fields: {
                'KW': 'KW_AUDIT_FIX',
                'CN（中文）': '设置',
                '所在页面': '主页',
                'ES（西班牙）': 'Ajustes'
              }
            }
          ]
        });

      expect(res.status).toBe(200);

      // Verify term translations in DB
      const row = await db.queryOne('SELECT translations, translations_meta FROM terms WHERE id = $1', [testTermId]);
      const trans = typeof row.translations === 'string' ? JSON.parse(row.translations) : row.translations;

      // Existing languages MUST be preserved!
      expect(trans['EN（英文）']).toBe('Settings');
      expect(trans['FR（法）']).toBe('Paramètres');
      expect(trans['DE（德）']).toBe('Einstellungen');
      // Newly added language MUST be present!
      expect(trans['ES（西班牙）']).toBe('Ajustes');
    });
  });

  describe('Fix 2: RBAC Guards for Viewer Role', () => {
    it('should reject viewer from calling /api/tables/:tableId/sync with 403', async () => {
      const res = await request(app)
        .post(`/api/tables/${testVersionId}/sync`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ updated: [{ recordId: testTermId, fields: { 'KW': 'KW_HACK' } }] });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject viewer from calling /api/tables/:tableId/clean-empty with 403', async () => {
      const res = await request(app)
        .delete(`/api/tables/${testVersionId}/clean-empty`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject viewer from calling /api/terms/batch-update with 403', async () => {
      const res = await request(app)
        .post('/api/terms/batch-update')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          termIds: [testTermId],
          updates: { owner: 'Hacker' }
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject viewer from calling /api/terms/batch-clear-translations with 403', async () => {
      const res = await request(app)
        .post('/api/terms/batch-clear-translations')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          termIds: [testTermId]
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject viewer from calling /api/tables/:tableId/batch-generate-kw with 403', async () => {
      const res = await request(app)
        .post(`/api/tables/${testVersionId}/batch-generate-kw`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          termIds: [testTermId]
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should reject viewer from calling /api/versions/:versionId/inherit-translations with 403', async () => {
      const res = await request(app)
        .post(`/api/versions/${testVersionId}/inherit-translations`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          sourceVersionId: testVersionId
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Fix 3: SSRF Protection in dify-test', () => {
    it('should block connection to 127.0.0.1 with 400 and ssrf-blocked', async () => {
      const res = await request(app)
        .post('/api/projects/proj-default/dify-test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ baseUrl: 'http://127.0.0.1:8080/v1' });

      expect(res.status).toBe(400);
      expect(res.headers['x-business-error']).toBe('ssrf-blocked');
    });

    it('should block connection to AWS metadata IP 169.254.169.254 with 400 and ssrf-blocked', async () => {
      const res = await request(app)
        .post('/api/projects/proj-default/dify-test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ baseUrl: 'http://169.254.169.254/latest/meta-data' });

      expect(res.status).toBe(400);
      expect(res.headers['x-business-error']).toBe('ssrf-blocked');
    });
  });

  describe('Fix 4: Version Cloning Preserves sort_order', () => {
    it('should copy sort_order during inherit-chunk', async () => {
      const newVersionId = 'ver-inherited-' + Date.now();
      const newVersionName = '继承新表_' + Date.now();
      const nowExpr = getDbType() === 'postgres' ? 'NOW()' : "datetime('now')";
      await db.run(
        `INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, ${nowExpr})`,
        [newVersionId, newVersionName]
      );

      const inheritRes = await request(app)
        .post(`/api/projects/proj-default/versions/${newVersionId}/inherit-chunk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          baseVersionId: testVersionId,
          offset: 0,
          limit: 10
        });

      expect(inheritRes.status).toBe(200);

      // Query cloned terms
      const clonedTerms = await db.query(
        'SELECT kw, sort_order FROM terms WHERE version_id = $1 ORDER BY sort_order ASC',
        [newVersionId]
      );

      expect(clonedTerms.length).toBe(2);
      expect(clonedTerms[0].kw).toBe('KW_AUDIT_FIX');
      expect(clonedTerms[0].sort_order).toBe(10);
      expect(clonedTerms[1].kw).toBe('KW_AUDIT_FIX_2');
      expect(clonedTerms[1].sort_order).toBe(20);
    });
  });
});
