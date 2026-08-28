const request = require('supertest');
const app = require('../app.cjs');
const { ensureDbInit, db } = require('../config/db.cjs');
const { generateKwHelper, formatKw } = require('../services/difyService.cjs');

describe('KW Generation & Batch KW API (/api/projects/:projectId/generate-kw, /api/tables/:tableId/batch-generate-kw)', () => {
  let adminToken = '';
  const testVersionId = 'ver-kw-test-' + Date.now();
  const testVersionName = 'KW批量测试表_' + Date.now();

  beforeAll(async () => {
    await ensureDbInit();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wangzhaoyun', password: 'magene123' });
    adminToken = adminRes.body.token;

    await db.run(
      "INSERT INTO versions (id, project_id, version_name, created_at) VALUES ($1, 'proj-default', $2, datetime('now'))",
      [testVersionId, testVersionName]
    );

    await db.run(
      "INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, sort_order, status) VALUES ($1, $2, '__EMPTY_KW_1__', '页面1', '王赵云', '重试', '{\"EN（英文）\":\"Retry\"}', '{}', datetime('now'), datetime('now'), 0, 1, 'DRAFT')",
      ['term-kw-1-' + Date.now(), testVersionId]
    );

    await db.run(
      "INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, sort_order, status) VALUES ($1, $2, '__EMPTY_KW_2__', '页面2', '王赵云', '配对成功', '{\"EN（英文）\":\"Pairing Successful\"}', '{}', datetime('now'), datetime('now'), 0, 2, 'DRAFT')",
      ['term-kw-2-' + Date.now(), testVersionId]
    );

    await db.run(
      "INSERT INTO terms (id, version_id, kw, context, owner, zh_cn, translations, translations_meta, created_at, updated_at, is_locked, sort_order, status) VALUES ($1, $2, 'KW_EXISTING_CUSTOM', '页面3', '王赵云', '心率', '{\"EN（英文）\":\"Heart Rate\"}', '{}', datetime('now'), datetime('now'), 0, 3, 'APPROVED')",
      ['term-kw-3-' + Date.now(), testVersionId]
    );
  });

  describe('generateKwHelper & formatKw Unit Logic', () => {
    it('formatKw should format text to uppercase snake-case with KW_ prefix', () => {
      expect(formatKw('Retry')).toBe('KW_RETRY');
      expect(formatKw('Please confirm on phone')).toBe('KW_PLEASE_CONFIRM_ON_PHONE');
      expect(formatKw('KW_SPEED')).toBe('KW_SPEED');
      expect(formatKw('pairing-successful!')).toBe('KW_PAIRING_SUCCESSFUL');
    });

    it('generateKwHelper should accurately translate common firmware & UI terms', async () => {
      const kwRetry = await generateKwHelper('proj-default', '重试');
      expect(kwRetry).toBe('KW_RETRY');

      const kwPairingSuccess = await generateKwHelper('proj-default', '配对成功');
      expect(kwPairingSuccess).toBe('KW_PAIRING_SUCCESSFUL');

      const kwConfirm = await generateKwHelper('proj-default', '确定');
      expect(kwConfirm).toBe('KW_CONFIRM');

      const kwCadence = await generateKwHelper('proj-default', '平均踏频');
      expect(kwCadence).toBe('KW_AVG_CADENCE');
    });

    it('generateKwHelper should prefer existing English text when provided', async () => {
      const kw = await generateKwHelper('proj-default', '任意自定义文字', 'Custom Feature Action');
      expect(kw).toBe('KW_CUSTOM_FEATURE_ACTION');
    });

    it('generateKwHelper should directly format pure ASCII/English source text', async () => {
      const kw = await generateKwHelper('proj-default', 'OTA Update');
      expect(kw).toBe('KW_OTA_UPDATE');
    });
  });

  describe('Single / Batch KW HTTP Endpoints', () => {
    it('POST /api/projects/:projectId/generate-kw should generate accurate KW', async () => {
      const res = await request(app)
        .post('/api/projects/proj-default/generate-kw')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ text: '重试', enText: 'Retry' });

      expect(res.status).toBe(200);
      expect(res.body.kw).toBe('KW_RETRY');
    });

    it('POST /api/projects/:projectId/batch-generate-kw should batch preview KWs', async () => {
      const res = await request(app)
        .post('/api/projects/proj-default/batch-generate-kw')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({
          items: [
            { id: '1', text: '重试', enText: 'Retry' },
            { id: '2', text: '配对失败', enText: 'Pairing Failed' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(2);
      expect(res.body.results[0].kw).toBe('KW_RETRY');
      expect(res.body.results[1].kw).toBe('KW_PAIRING_FAILED');
    });

    it('POST /api/tables/:tableId/batch-generate-kw should update empty KWs in table', async () => {
      const res = await request(app)
        .post('/api/tables/' + testVersionId + '/batch-generate-kw')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({
          overwrite: false
        });

      expect(res.status).toBe(200);
      expect(res.body.updatedCount).toBe(2);

      const recordsRes = await request(app)
        .get('/api/tables/' + testVersionId + '/records')
        .set('Authorization', 'Bearer ' + adminToken);

      expect(recordsRes.status).toBe(200);
      const t1 = recordsRes.body.records.find(r => r.fields['CN（中文）'] === '重试');
      const t2 = recordsRes.body.records.find(r => r.fields['CN（中文）'] === '配对成功');
      const t3 = recordsRes.body.records.find(r => r.fields['CN（中文）'] === '心率');

      expect(t1.fields.KW).toBe('KW_RETRY');
      expect(t2.fields.KW).toBe('KW_PAIRING_SUCCESSFUL');
      expect(t3.fields.KW).toBe('KW_EXISTING_CUSTOM');
    });
  });
});