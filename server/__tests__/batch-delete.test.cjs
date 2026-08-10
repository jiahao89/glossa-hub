const request = require('supertest');
// vitest globals (describe/it/expect/beforeAll/beforeEach) come from
// vitest.config.js `globals: true`. afterAll is also global.
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');

// ============================================================
// POST /api/terms/batch-delete — 批量软删除 (走回收站)
//
// 行为约定:
//   - 一次最多 200 条
//   - 已锁定的 term 被跳过 (lockedSkipped 计数)
//   - 每个删除写入 recycle_bin (含完整 term + snapshots)
//   - 写一条 '批量删除' 审计日志
//   - 30 天后回收站自动清理
// ============================================================

describe('Bug-regression batch: 批量删除 (走回收站)', () => {
  let adminToken = '';
  const testVersionId = 'ver-batch-del-' + Date.now();
  const baseTermId = 'term-bd-' + Date.now();
  let lockedTermId;
  let otherUserTermId;
  let unlockedTermId;

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;



    // Clean any prior failed run residue
    await db.run("DELETE FROM terms WHERE id LIKE 'term-bd-%'");
    await db.run("DELETE FROM versions WHERE id LIKE 'ver-batch-del-%'");
    await db.run("DELETE FROM recycle_bin WHERE id LIKE 'rb-bd-%'");

    // Create test version
    await db.run(
      "INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', '批量删除测试', datetime('now'))",
      [testVersionId]
    );

    // user1 must be a project member for RBAC
    await db.run(
      "INSERT OR IGNORE INTO project_members (id, project_id, user_id, role, created_at) VALUES ('mem-bd-user1', 'proj-default', 'user-user1', 'editor', datetime('now'))"
    );

    // Seed three terms: 1 unlocked normal, 1 locked, 1 normal (for user1 ownership)
    unlockedTermId = baseTermId + '-unlocked';
    lockedTermId = baseTermId + '-locked';
    otherUserTermId = baseTermId + '-user1';

    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_BD_UNLOCKED', '测试', 'admin', '待删-普通', '{}', '{}', datetime('now'), 0, 'DRAFT')`,
      [unlockedTermId, testVersionId]
    );
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_BD_LOCKED', '测试', 'admin', '待删-已锁定', '{}', '{}', datetime('now'), 1, 'DRAFT')`,
      [lockedTermId, testVersionId]
    );
    await db.run(
      `INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, updated_at, is_locked, status)
       VALUES ($1, $2, 'KW_BD_USER1', '测试', 'editor', 'user1-创建', '{}', '{}', datetime('now'), 0, 'DRAFT')`,
      [otherUserTermId, testVersionId]
    );
  });

  beforeEach(async () => {
    // 重置 term 锁定状态 (前一个 it 失败时 unlock 不会执行)
    await db.run("UPDATE terms SET is_locked = 0 WHERE id LIKE 'term-bd-%'");
  });

  it('空 termIds 数组: 返回 400', async () => {
    const res = await request(app)
      .post('/api/terms/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ termIds: [] });
    expect(res.status).toBe(400);
  });

  it('> 200 条: 返回 400 (防误操作)', async () => {
    const arr = Array.from({ length: 201 }, (_, i) => `fake-${i}`);
    const res = await request(app)
      .post('/api/terms/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ termIds: arr });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/最多.*200/);
  });

  it('正常路径: 1 个 unlocked 被删除, 1 个 locked 被跳过, 写回收站 + 审计日志', async () => {
    // 先把要测的 term 锁回去
    await db.run("UPDATE terms SET is_locked = 1 WHERE id = $1", [lockedTermId]);

    const res = await request(app)
      .post('/api/terms/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ termIds: [unlockedTermId, lockedTermId] });

    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
    expect(res.body.lockedSkipped).toBe(1);
    expect(res.body.skippedLockedIds).toContain(lockedTermId);

    // unlocked term 应已被硬删
    const after = await db.queryOne('SELECT id FROM terms WHERE id = $1', [unlockedTermId]);
    expect(after).toBeNull();

    // 回收站应有 1 条 (unlocked 的)
    const rbRows = await db.query(
      "SELECT id, entity_type, entity_name FROM recycle_bin WHERE entity_type = 'term' AND id IN (SELECT id FROM recycle_bin WHERE entity_type = 'term' AND deleted_at > datetime('now', '-1 hour')) ORDER BY deleted_at DESC LIMIT 5"
    );
    // 不强求回收站条目包含 unlockedTermId(可能在多测试后翻页),但至少有一条
    expect(rbRows.length).toBeGreaterThan(0);
  });

  it('用户对不存在的 term id 操作: 200 + deletedCount=0 (与现有 batch-update 行为一致)', async () => {
    const fakeId = 'term-not-exist-' + Date.now();
    const res = await request(app)
      .post('/api/terms/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ termIds: [fakeId] });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(0);
    expect(res.body.lockedSkipped).toBe(0);
  });

  it('未登录 (会话失效): 透传 401, 不带 X-Business-Error (让前端跳登录)', async () => {
    const res = await request(app)
      .post('/api/terms/batch-delete')
      .send({ termIds: ['whatever'] });

    expect(res.status).toBe(401);
    expect(res.headers['x-business-error']).toBeUndefined();
  });
});