const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');

describe('RBAC & Permission Matrix (/api/admin, /api/projects)', () => {
  let adminToken = '';
  let userToken = '';
  let viewerToken = '';
  const testVersionId = 'ver-rbac-test-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    // Seed test version under proj-default
    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', 'RBAC测试表', datetime('now'))",
      [testVersionId]
    );

    // Login Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Login Editor User
    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user1', password: 'user123' });
    userToken = userRes.body.token;

    // Login Viewer User
    const viewerRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'viewer1', password: 'viewer123' });
    viewerToken = viewerRes.body.token;
  });

  it('should allow System Admin to fetch user list', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should forbid non-admin user from fetching user list', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('should forbid Viewer role from writing/syncing terms', async () => {
    const res = await request(app)
      .post('/api/sync-table')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        tableId: testVersionId,
        tableName: 'RBAC测试表',
        records: []
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toMatch(/只读审核人员无权/);
  });

  it('should allow Admin or Owner to query project Dify status', async () => {
    const res = await request(app)
      .get('/api/projects/proj-default/dify')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('apiKeyConfigured');
  });
});
