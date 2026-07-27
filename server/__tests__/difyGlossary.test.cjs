const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');

describe('AI Translation & Glossary Interception (/api/projects/:projectId/ai-translate)', () => {
  let adminToken = '';
  const testTableId = 'gt-unit-test-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    // Seed a glossary table and term
    await db.run(
      "INSERT OR IGNORE INTO glossary_tables (id, project_id, table_name, created_at) VALUES ($1, 'proj-default', '测试术语表', datetime('now'))",
      [testTableId]
    );

    await db.run(
      `INSERT OR IGNORE INTO glossary_terms (id, table_id, cn_term, en_term, description, created_at, fields)
       VALUES ('gt-term-1', $1, '踏频传感器', 'Cadence Sensor', '骑行测量配件', datetime('now'), '{"所在页面":"主界面"}')`,
      [testTableId]
    );
  });

  it('should intercept exact glossary match and return local translation directly (bypass AI)', async () => {
    const res = await request(app)
      .post('/api/projects/proj-default/ai-translate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        inputs: {
          kw: 'KW_CADENCE_SENSOR',
          chinese: '踏频传感器',
          target_languages: 'EN（英文）'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('_source', 'tm');
    expect(res.body['EN（英文）']).toBe('Cadence Sensor');
  });

  it('should generate KW correctly using backend helper endpoint', async () => {
    const origFetch = global.fetch;
    global.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('translate.googleapis.com')) {
        return {
          ok: true,
          json: async () => [[['Heart Rate Monitor']]]
        };
      }
      return origFetch(url);
    };

    try {
      const res = await request(app)
        .post('/api/projects/proj-default/generate-kw')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: '心率带' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('kw');
      expect(res.body.kw).toBe('KW_HEART_RATE_MONITOR');
    } finally {
      global.fetch = origFetch;
    }
  });
});
