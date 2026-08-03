const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db, getDbType } = require('../config/db.cjs');

describe('Bug-regression batch: Bug 4 (PUT 锁定竞态), Bug 5 (admin 时间戳), Bug 11 (回收站硬删 auth)', () => {
  let adminToken = '';
  let userToken = '';
  const testVersionId = 'ver-bug-regression-' + Date.now();
  const testTermId = 'term-bug-regression-' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user1', password: 'user123' });
    userToken = userRes.body.token;

    // 清理上一次跑失败的残留: bug-regression 测试在前面断言失败时不会自动解锁, 这会让
    // 下次跑时该 term 处于 locked 状态、阻塞后续 PUT。所以 beforeAll 显式清理一次。
    await db.run("DELETE FROM terms WHERE id LIKE 'term-bug-regression-%'");
    await db.run("DELETE FROM versions WHERE id LIKE 'ver-bug-regression-%'");
    await db.run("DELETE FROM recycle_bin WHERE id LIKE 'rb-ghost-%'");
    await db.run("DELETE FROM users WHERE username LIKE 'regression_user_%'");

    // Seed test version + term
    await db.run(
      "INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', '锁定竞态测试', datetime('now'))",
      [testVersionId]
    );
    // user1 必须是 proj-default 的 member, 否则 requireTermOwnership 在 v1.1 review C2
    // 修复后会直接 403。这条 INSERT 在默认 seed 已有 (mem-user1), 但幂等保险。
    await db.run(
      "INSERT OR IGNORE INTO project_members (id, project_id, user_id, role, created_at) VALUES ('mem-regression-user1', 'proj-default', 'user-user1', 'editor', datetime('now'))"
    );
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_LOCK_RACE', '测试', '标题', '锁定竞态词条', '{"EN（英文）":"A"}', '{}', datetime('now'), 0, 'DRAFT')`,
      [testTermId, testVersionId]
    );
  });

  // 每个 it 之前重置 term 状态, 防止同 describe 内的 it 之间污染 (前一个失败时 unlock 不会执行)
  beforeEach(async () => {
    await db.run("UPDATE terms SET is_locked = 0, locked_by = NULL, locked_at = NULL WHERE id = $1", [testTermId]);
  });

  // ========== Bug 4 ==========

  it('Bug 4: 锁定后并发 PUT 必须返回 403 LOCKED 而不是悄悄写入', async () => {
    // 1) 锁定该词条
    const lockRes = await request(app)
      .put(`/api/terms/${testTermId}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isLocked: true });
    expect(lockRes.status).toBe(200);

    // 2) 读取 updated_at (作为 oldUpdatedAt 用于乐观锁)
    const termRes = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const targetTerm = termRes.body.records.find(r => r.recordId === testTermId);
    expect(targetTerm).toBeDefined();

    // 3) 用户尝试 PUT — 必须被拒绝 (lock guard 或 optimistic lock mismatch)
    const putRes = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        oldUpdatedAt: targetTerm.updatedAt,
        zh_cn: '不应写入的中文',
        translations: { 'EN（英文）': 'should not write' }
      });

    expect([403, 409]).toContain(putRes.status);
    expect(putRes.body.error).toMatch(/LOCKED|CONCURRENCY_CONFLICT/);

    // 4) 验证 zh_cn 实际未被改写
    const verifyRes = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const after = verifyRes.body.records.find(r => r.recordId === testTermId);
    expect(after.fields['CN（中文）']).toBe('锁定竞态词条');

    // 5) 解锁，给后续测试一个干净状态
    await request(app)
      .put(`/api/terms/${testTermId}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isLocked: false });
  });

  it('Bug 4 路径仍允许正常 PUT (regression sanity)', async () => {
    const termRes = await request(app)
      .get(`/api/tables/${testVersionId}/records`)
      .set('Authorization', `Bearer ${adminToken}`);
    const targetTerm = termRes.body.records.find(r => r.recordId === testTermId);

    const putRes = await request(app)
      .put(`/api/terms/${testTermId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        oldUpdatedAt: targetTerm.updatedAt,
        zh_cn: '正常中文',
        translations: { 'EN（英文）': 'normal' }
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.zh_cn).toBe('正常中文');
  });

  // ========== Bug 5 ==========

  it('Bug 5: 系统管理员创建用户, 创建时间戳由 DB 默认填充', async () => {
    const username = 'regression_user_' + Date.now();
    const before = Date.now();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username, password: 'test1234', name: '回归用户', role: 'user' });
    expect(res.status).toBe(201);

    // 读回该行,确认 created_at 存在且合理
    const row = await db.queryOne('SELECT created_at FROM users WHERE username = $1', [username]);
    expect(row).toBeDefined();
    expect(row.created_at).toBeTruthy();

    // 解析 created_at — SQLite 是 ISO 字符串, PG 是 Date 对象 (驱动通常序列化为 ISO)
    const ts = row.created_at instanceof Date ? row.created_at.getTime() : new Date(row.created_at).getTime();
    expect(Number.isFinite(ts)).toBe(true);
    // 与 before 对比 (允许 5 秒时钟漂移)
    expect(Math.abs(ts - before)).toBeLessThan(5000);

    // 清理
    await db.run('DELETE FROM users WHERE username = $1', [username]);
  });

  // ========== Bug 11 ==========

  it('Bug 11: 非 admin 不能硬删 projectId 缺失的回收站条目', async () => {
    // 手工插入一条 projectId 缺失的回收站条目 (绕过 backupToRecycleBin)
    const ghostItemId = 'rb-ghost-' + Date.now();
    // 注意: payload 必须存在 entity_type/version/version.project_id 这种结构, 但故意让
    // recycleBin 路由解析 projectId 时拿到空字符串。language entity 走不同分支,
    // 选 version 但故意没有 project_id 字段。
    const payload = JSON.stringify({ version: { id: 'ver-phantom', version_name: '幻影' } }); // 无 project_id
    if (getDbType() === 'postgres') {
      await db.run(
        `INSERT INTO recycle_bin (id, entity_type, entity_name, payload, deleted_by, deleted_at, expires_at)
         VALUES ($1, 'version', '幻影版本', $2::jsonb, NULL, NOW(), NOW() + INTERVAL '30 days')`,
        [ghostItemId, payload]
      );
    } else {
      await db.run(
        `INSERT INTO recycle_bin (id, entity_type, entity_name, payload, deleted_by, deleted_at, expires_at)
         VALUES ($1, 'version', '幻影版本', $2, NULL, datetime('now'), datetime('now', '+30 days'))`,
        [ghostItemId, payload]
      );
    }

    // editor (user1) 试图硬删 → 应被拒
    const userDelRes = await request(app)
      .delete(`/api/recycle-bin/${ghostItemId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(userDelRes.status).toBe(403);

    // 验证条目还在
    const stillThere = await db.queryOne('SELECT id FROM recycle_bin WHERE id = $1', [ghostItemId]);
    expect(stillThere).toBeDefined();

    // admin 才能硬删
    const adminDelRes = await request(app)
      .delete(`/api/recycle-bin/${ghostItemId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDelRes.status).toBe(200);

    const after = await db.queryOne('SELECT id FROM recycle_bin WHERE id = $1', [ghostItemId]);
    expect(after).toBeNull();
  });
});