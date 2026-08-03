const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');
const { TARGET_LANGUAGES } = require('../config/constants.cjs');

// Regression coverage for Bug 1 (硬编码的导出语种与 DB 不一致) and Bug 7 (Dashboard 假兜底用户名).
// 前置：依赖默认 seed 的 proj-default 项目与默认 admin `wangzhaoyun`/`magene123`。
describe('Bug-regression /api/tables/:id/export-xls + /api/dashboard/stats', () => {
  let adminToken = '';
  const testVersionId = 'ver-export-test-' + Date.now();
  const canonicalTermId = 'term-export-canonical-' + Date.now();
  const legacyAliasTermId = 'term-export-legacy-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    await db.run(
      "INSERT OR IGNORE INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', '导出回归测试', datetime('now'))",
      [testVersionId]
    );

    // Row 1: uses canonical keys — should land under the matching column.
    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_CANONICAL', '测试', '标题', '正轨', ?, '{}', datetime('now'), 0, 'DRAFT')`,
      [
        canonicalTermId,
        testVersionId,
        JSON.stringify({ 'EN（英文）': 'Speed', 'JP（日）': '速度', '瑞典': 'hastighet' })
      ]
    );

    // Row 2: uses an older legacy alias — should be remapped to its canonical column.
    // Per constants.cjs LEGACY_TO_NEW_LANG_MAP, "英文" -> "EN（英文）", "日" -> "JP（日）".
    await db.run(
      `INSERT OR IGNORE INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_LEGACY', '测试', '标题', '遗留键', ?, '{}', datetime('now'), 0, 'DRAFT')`,
      [
        legacyAliasTermId,
        testVersionId,
        JSON.stringify({ '英文': 'Velocity', '日': 'スピード' })
      ]
    );
  });

  it('导出表头与 constants.cjs 的规范语种一致 (Bug 1 回归)', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/export-xls`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const lines = res.text.split('\r\n').filter(Boolean);
    // The CSV body starts with a UTF-8 BOM so Excel treats it as UTF-8 — strip
    // it before comparing headers.
    const headers = lines[0].replace(/^﻿/, '').split(',');

    // 前 4 列为系统固定列
    expect(headers.slice(0, 4)).toEqual(['KW', 'CN（中文）', '所在页面', '字号类别']);

    // 剩余列必须精确等于规范 TARGET_LANGUAGES，不允许出现旧版的"瑞典："/"荷兰："/"土耳其："
    const langCols = headers.slice(4);
    expect(langCols).toEqual(TARGET_LANGUAGES);
    expect(langCols).not.toContain('土耳其：');
    expect(langCols).not.toContain('瑞典：');
    expect(langCols).not.toContain('荷兰：');
  });

  it('规范键值落在正确的列上', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/export-xls`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const lines = res.text.split('\r\n').filter(Boolean);
    // The CSV body starts with a UTF-8 BOM so Excel treats it as UTF-8 — strip
    // it before comparing headers.
    const headers = lines[0].replace(/^﻿/, '').split(',');
    const enIdx = headers.indexOf('EN（英文）');
    const jpIdx = headers.indexOf('JP（日）');
    const seIdx = headers.indexOf('瑞典');
    expect(enIdx).toBeGreaterThan(3);
    expect(jpIdx).toBeGreaterThan(3);
    expect(seIdx).toBeGreaterThan(3);

    const row = lines.slice(1).find(l => l.startsWith('KW_CANONICAL,'));
    expect(row).toBeDefined();
    const cells = row.split(',');
    expect(cells[enIdx]).toBe('Speed');
    expect(cells[jpIdx]).toBe('速度');
    expect(cells[seIdx]).toBe('hastighet');
  });

  it('遗留别名键映射回规范列', async () => {
    const res = await request(app)
      .get(`/api/tables/${testVersionId}/export-xls`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const lines = res.text.split('\r\n').filter(Boolean);
    // The CSV body starts with a UTF-8 BOM so Excel treats it as UTF-8 — strip
    // it before comparing headers.
    const headers = lines[0].replace(/^﻿/, '').split(',');
    const enIdx = headers.indexOf('EN（英文）');
    const jpIdx = headers.indexOf('JP（日）');

    const row = lines.slice(1).find(l => l.startsWith('KW_LEGACY,'));
    expect(row).toBeDefined();
    const cells = row.split(',');
    expect(cells[enIdx]).toBe('Velocity');
    expect(cells[jpIdx]).toBe('スピード');  });

  it('Dashboard 缺失用户的日志显示 "已删除用户"，不会假托给真实管理员 (Bug 7 回归)', async () => {
    // 直接插入一条 user_id 指向不存在用户的日志条目
    const ghostUserId = 'user-deleted-' + Date.now();
    await db.run(
      "INSERT INTO logs_v2 (timestamp, kw, chinese, action, details, version_name, user_id) VALUES (datetime('now'), 'KW_GHOST', '幽灵词条', '修改词条', '自动测试', '导出回归测试', $1)",
      [ghostUserId]
    );

    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const ghost = res.body.recentLogs.find(l => l.kw === 'KW_GHOST');
    expect(ghost).toBeDefined();
    expect(ghost.operator).toBe('已删除用户');
    expect(ghost.operator).not.toBe('wangzhaoyun');
    expect(ghost.operator).not.toBe('王赵云');
  });
});
