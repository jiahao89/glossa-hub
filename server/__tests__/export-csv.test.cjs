const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');
const { TARGET_LANGUAGES } = require('../config/constants.cjs');

describe('/api/tables/:id/export-csv - 导出 CSV', () => {
  let adminToken = '';
  const testVersionId = 'ver-csv-export-test-' + Date.now();
  const term1Id = 'term-csv-1-' + Date.now();
  const term2Id = 'term-csv-2-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', 'CSV导出测试表', datetime('now'))",
      [testVersionId]
    );

    // Row 1
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status, sort_order)
       VALUES ($1, $2, 'KW_FIRST', '页面A', '负责人A', '中文一', ?, '{}', datetime('now'), 0, 'DRAFT', 1)`,
      [
        term1Id,
        testVersionId,
        JSON.stringify({ 'EN（英文）': 'First English', 'JP（日）': '日文一' })
      ]
    );

    // Row 2
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status, sort_order)
       VALUES ($1, $2, 'KW_SECOND', '页面B', '负责人B', '中文二', ?, '{}', datetime('now'), 0, 'DRAFT', 2)`,
      [
        term2Id,
        testVersionId,
        JSON.stringify({ 'EN（英文）': 'Second, with comma', 'JP（日）': '日文二' })
      ]
    );
  });

  it('CSV 导出表头不包含“所在页面”和“字号类别”，其他字段与 TARGET_LANGUAGES 一致', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/export-csv`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const text = res.text;
    // Should start with BOM \uFEFF
    expect(text.charCodeAt(0)).toBe(0xFEFF);

    const lines = text.slice(1).split('\r\n');
    const headerLine = lines[0];
    const headers = headerLine.split(',');

    // Must NOT contain 所在页面 or 字号类别
    expect(headers).not.toContain('所在页面');
    expect(headers).not.toContain('字号类别');
    expect(headers).not.toContain('负责人');

    // First two columns must be KW and CN（中文）
    expect(headers[0]).toBe('KW');
    expect(headers[1]).toBe('CN（中文）');

    // Remaining columns must equal TARGET_LANGUAGES
    expect(headers.slice(2)).toEqual(TARGET_LANGUAGES);
  });

  it('CSV 正确转义含有逗号的字段并按原始 sort_order 顺序导出', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/export-csv`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const text = res.text;
    const lines = text.slice(1).split('\r\n');

    expect(lines.length).toBeGreaterThanOrEqual(3);
    // Row 1 should have KW_FIRST
    expect(lines[1]).toContain('KW_FIRST');
    expect(lines[1]).toContain('中文一');
    expect(lines[1]).not.toContain('页面A');
    expect(lines[1]).not.toContain('负责人A');

    // Row 2 should have KW_SECOND and properly quoted "Second, with comma"
    expect(lines[2]).toContain('KW_SECOND');
    expect(lines[2]).toContain('"Second, with comma"');
  });
});
