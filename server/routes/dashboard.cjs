const express = require('express');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken } = require('../middleware/auth.cjs');

// GET /api/dashboard/stats - 获取看版数据统计
router.get('/stats', authenticateToken, async (_req, res) => {
  try {
    const languages = await db.query(
      "SELECT lang_name FROM languages WHERE project_id = 'proj-default' ORDER BY display_order ASC"
    );
    const langNames = languages.map(l => l.lang_name);
    const langCount = langNames.length || 1;

    const versions = await db.query("SELECT id, version_name FROM versions WHERE project_id = $1", ['proj-default']);
    const terms = await db.query(
      `SELECT t.id, t.version_id, t.translations, t.status FROM terms t
       JOIN versions v ON t.version_id = v.id
       WHERE v.project_id = $1`,
      ['proj-default']
    );

    const versionCount = versions.length;
    const termCount = terms.length;
    const totalCells = termCount * langCount;
    let filledCells = 0;
    let fullyTranslatedCount = 0;

    const langFilledMap = {};
    langNames.forEach(l => { langFilledMap[l] = 0; });

    const langReviewedMap = {};
    langNames.forEach(l => { langReviewedMap[l] = 0; });
    let reviewedTerms = 0;

    const versionStatsMap = {};
    versions.forEach(v => {
      versionStatsMap[v.id] = { id: v.id, name: v.version_name, totalTerms: 0, filledCells: 0, fullyTranslatedTerms: 0 };
    });

    for (const t of terms) {
      let trans = {};
      try { trans = typeof t.translations === 'string' ? JSON.parse(t.translations || '{}') : (t.translations || {}); } catch { trans = {}; }

      let termFilledCount = 0;
      for (const lang of langNames) {
        const val = trans[lang];
        if (val && val.toString().trim() !== '') { filledCells++; termFilledCount++; langFilledMap[lang]++; }
      }

      const isReviewed = t.status === 'APPROVED' || t.status === 'PUBLISHED';
      if (isReviewed) {
        reviewedTerms++;
        for (const lang of langNames) {
          langReviewedMap[lang]++;
        }
      }

      const isFull = termFilledCount === langCount && langCount > 0;
      if (isFull) fullyTranslatedCount++;

      const vStat = versionStatsMap[t.version_id];
      if (vStat) {
        vStat.totalTerms++;
        vStat.filledCells += termFilledCount;
        if (isFull) vStat.fullyTranslatedTerms++;
      }
    }

    const tableProgress = Object.values(versionStatsMap).map(vStat => {
      const vTotalCells = vStat.totalTerms * langCount;
      const progress = vTotalCells > 0 ? Math.round((vStat.filledCells / vTotalCells) * 100) : 0;
      return { id: vStat.id, name: vStat.name, totalTerms: vStat.totalTerms, fullyTranslatedTerms: vStat.fullyTranslatedTerms, progress };
    });

    const globalCoverage = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

    const langProgress = langNames.map(l => ({
      lang: l,
      filled: langFilledMap[l],
      total: termCount,
      coverage: termCount > 0 ? Math.round((langFilledMap[l] / termCount) * 100) : 0
    }));

    const langReviewProgress = langNames.map(l => ({
      lang: l,
      filled: langReviewedMap[l],
      total: termCount,
      coverage: termCount > 0 ? Math.round((langReviewedMap[l] / termCount) * 100) : 0
    }));
    const reviewCoverage = termCount > 0 ? Math.round((reviewedTerms / termCount) * 100) : 0;

    const dbType = getDbType();
    const logsTable = dbType === 'postgres' ? 'logs' : 'logs_v2';
    const recentLogsRaw = await db.query(
      `SELECT l.*, u.name AS operator_name FROM ${logsTable} l
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY l.id DESC LIMIT 5`
    );

    const recentLogs = recentLogsRaw.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      kw: r.kw,
      chinese: r.chinese,
      action: r.action,
      details: r.details,
      version: r.version_name,
      operator: r.operator_name || '王赵云'
    }));

    res.json({
      versionCount,
      termCount,
      filledCells,
      totalCells,
      coverage: globalCoverage,
      fullyTranslatedCount,
      tableProgress,
      langProgress,
      langReviewProgress,
      reviewedTermCount: reviewedTerms,
      reviewCoverage,
      recentLogs
    });
  } catch (err) {
    console.error('获取看板统计数据失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// GET /api/dashboard/ai-usage - AI 用量统计
router.get('/ai-usage', authenticateToken, async (_req, res) => {
  const dbType = getDbType();
  try {
    let todayStats, weekStats, dailyTrend;

    if (dbType === 'postgres') {
      todayStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(elapsed_time), 0) AS total_elapsed
        FROM ai_usage_logs
        WHERE created_at >= CURRENT_DATE
      `);

      weekStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);

      dailyTrend = await db.query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date ASC
      `);
    } else {
      todayStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(elapsed_time), 0) AS total_elapsed
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', 'start of day')
      `);

      weekStats = await db.query(`
        SELECT
          COUNT(*) AS call_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', '-7 days')
      `);

      dailyTrend = await db.query(`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS tokens
        FROM ai_usage_logs
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
      `);
    }

    res.json({
      today: {
        calls: todayStats[0]?.call_count || 0,
        tokens: todayStats[0]?.total_tokens || 0,
        elapsed: todayStats[0]?.total_elapsed || 0
      },
      week: {
        calls: weekStats[0]?.call_count || 0,
        tokens: weekStats[0]?.total_tokens || 0
      },
      dailyTrend: dailyTrend.map(d => ({ date: d.date, calls: d.calls, tokens: d.tokens }))
    });
  } catch (err) {
    console.error('获取 AI 用量统计失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
