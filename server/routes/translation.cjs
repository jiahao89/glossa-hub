const express = require('express');
const router = express.Router();
const { db, getDbType } = require('../config/db.cjs');
const { authenticateToken, requireProjectMember, requireRole } = require('../middleware/auth.cjs');
const { aiTranslateLimiter } = require('../middleware/rateLimiters.cjs');
const { getEffectiveDifyConfig, generateKwHelper } = require('../services/difyService.cjs');
const { parseJsonField } = require('../utils/jsonFields.cjs');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GlossaHub/1.1';

async function executeDifyWithFailover(primaryConfig, inputs, userIdStr) {
  const candidates = [
    primaryConfig,
    { baseUrl: 'https://night.magene.cn/v1', apiKey: 'app-zV0Lo78Bi5WjhplWDL7OwsWR' },
    { baseUrl: 'https://api.dify.ai/v1', apiKey: 'app-aochEehgytnJciYeI3L1pqfj' }
  ];

  const uniqueCandidates = [];
  const seen = new Set();

  for (const c of candidates) {
    if (!c || !c.baseUrl || !c.apiKey) continue;
    let url = c.baseUrl.replace(/\/$/, '').trim();
    let key = c.apiKey;
    if (url.includes('night.magene.cn')) {
      key = 'app-zV0Lo78Bi5WjhplWDL7OwsWR';
    } else if (url.includes('api.dify.ai') && key === 'app-zV0Lo78Bi5WjhplWDL7OwsWR') {
      key = 'app-aochEehgytnJciYeI3L1pqfj';
    }
    const sig = `${url}___${key}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      uniqueCandidates.push({ baseUrl: url, apiKey: key });
    }
  }

  let lastStatus = 500;
  let lastErrorText = '';

  for (const item of uniqueCandidates) {
    try {
      const targetUrl = `${item.baseUrl}/workflows/run`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${item.apiKey}`,
          'User-Agent': BROWSER_USER_AGENT,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          inputs,
          response_mode: 'blocking',
          user: userIdStr || 'glossahub_client'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const status = data.data?.status || data.status;
        if (status !== 'failed' && status !== 'stopped') {
          return { ok: true, data, usedUrl: item.baseUrl };
        } else {
          lastErrorText = data.data?.error || data.error || `Workflow status: ${status}`;
          console.warn(`⚠️ Dify workflow status ${status} on ${item.baseUrl}: ${lastErrorText}`);
        }
      } else {
        lastStatus = response.status;
        lastErrorText = await response.text();
        console.warn(`⚠️ Dify API returned ${response.status} from ${item.baseUrl}, trying failover...`);
      }
    } catch (err) {
      console.warn(`⚠️ Dify fetch exception on ${item.baseUrl}: ${err.message}`);
      lastErrorText = err.message;
    }
  }

  return { ok: false, status: lastStatus, errorText: lastErrorText };
}

// POST /api/projects/:projectId/dify - 保存项目的 Dify 配置
router.post('/projects/:projectId/dify', authenticateToken, requireProjectMember, requireRole(['owner']), async (req, res) => {
  const { projectId } = req.params;
  const { baseUrl, apiKey } = req.body;
  const dbType = getDbType();

  if (!baseUrl) {
    return res.status(400).json({ error: 'baseUrl 不能为空' });
  }

  try {
    const project = await db.queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    let existingConfig = {};
    if (project.dify_config && typeof project.dify_config === 'object') {
      existingConfig = project.dify_config;
    } else {
      try {
        existingConfig = JSON.parse(project.dify_config || '{}');
      } catch {
        existingConfig = {};
      }
    }
    let finalApiKey = apiKey;
    if (!finalApiKey || (baseUrl.includes('night.magene.cn') && finalApiKey === 'app-aochEehgytnJciYeI3L1pqfj')) {
      if (baseUrl.includes('night.magene.cn')) {
        finalApiKey = 'app-zV0Lo78Bi5WjhplWDL7OwsWR';
      } else {
        finalApiKey = existingConfig.apiKey || '';
      }
    }

    if (!finalApiKey) {
      return res.status(400).json({ error: 'apiKey 不能为空（尚未配置过密钥）' });
    }

    const newConfig = JSON.stringify({ baseUrl, apiKey: finalApiKey });
    if (dbType === 'postgres') {
      await db.run(
        'UPDATE projects SET dify_config = $1::jsonb WHERE id = $2',
        [newConfig, projectId]
      );
    } else {
      await db.run(
        'UPDATE projects SET dify_config = $1 WHERE id = $2',
        [newConfig, projectId]
      );
    }

    res.json({ message: 'Dify 配置已安全存入数据库！' });
  } catch (err) {
    console.error('保存 Dify 配置失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// GET /api/projects/:projectId/role - 获取当前用户在该项目中的角色
router.get('/projects/:projectId/role', authenticateToken, requireProjectMember, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json({ role: 'owner' });
  }
  res.json({ role: req.projectRole });
});

// GET /api/projects/:projectId/dify - 获取项目的 Dify 配置状态 (不返回明文 Key)
router.get('/projects/:projectId/dify', authenticateToken, requireProjectMember, async (req, res) => {
  const { projectId } = req.params;
  try {
    const config = await getEffectiveDifyConfig(projectId);

    res.json({
      baseUrl: config.baseUrl,
      apiKeyConfigured: !!config.apiKey,
      isCustom: config.isCustom
    });
  } catch (err) {
    console.error('读取 Dify 配置失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/projects/:projectId/ai-translate - 后端中转 Dify AI 翻译代理
router.post('/projects/:projectId/ai-translate', authenticateToken, requireProjectMember, requireRole(['owner', 'editor']), aiTranslateLimiter, async (req, res) => {
  const { projectId } = req.params;
  const { inputs } = req.body;
  const userId = req.user?.id || null;

  if (!inputs) {
    return res.status(400).json({ error: '缺少 inputs 输入参数' });
  }

  const termKw = inputs.kw || inputs.keyword || '';
  const zhCn = inputs.zh_cn || inputs.chinese || inputs.text || '';
  const targetLangs = inputs.target_languages || inputs.languages || '';

  try {
    // === START GLOSSARY INTERCEPTION ===
    const glossaryQuery = `
      SELECT t.cn_term, t.en_term, t.fields 
      FROM glossary_terms t
      JOIN glossary_tables tb ON t.table_id = tb.id
      WHERE tb.project_id = $1
    `;
    const glossaryTerms = await db.query(glossaryQuery, [projectId]);

    const allMatches = glossaryTerms.filter(term => term.cn_term === zhCn);
    let fullMatch = null;

    if (allMatches.length === 1) {
      fullMatch = allMatches[0];
    } else if (allMatches.length > 1) {
      const inputContext = (inputs.context || inputs.所在页面 || '').trim();
      const inputKw = (inputs.kw || inputs.keyword || inputs.KW || '').trim().toLowerCase();

      const subTerms = glossaryTerms.filter(t => 
        t.cn_term !== zhCn && t.cn_term.length >= 2 && zhCn.includes(t.cn_term)
      );

      const scoredMatches = allMatches.map(term => {
        let score = 0;
        let termFields = parseJsonField(term && term.fields);

        const pageContext = (termFields['所在页面'] || '').trim();
        const termKwVal = (termFields.KW || term.kw || '').trim().toLowerCase();
        const enTerm = (term.en_term || '').trim();
        const enLower = enTerm.toLowerCase();

        if (inputContext && inputContext !== '无' && pageContext) {
          if (pageContext.includes(inputContext) || inputContext.includes(pageContext)) {
            score += 100;
          }
        }

        if (inputKw && termKwVal) {
          if (inputKw === termKwVal || inputKw.includes(termKwVal) || termKwVal.includes(inputKw)) {
            score += 50;
          }
        }

        subTerms.forEach(sub => {
          const subEn = (sub.en_term || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (subEn.length >= 3) {
            const shortSub = subEn.substring(0, 3);
            if (enLower.includes(shortSub)) {
              score += 30;
            }
          }
        });

        if (enTerm.length > 0) {
          score += Math.min(10, enTerm.length);
        }

        const hasOtherLangs = Object.keys(termFields).some(k => k !== '所在页面' && k !== 'KW' && k !== '字号类别' && termFields[k]);
        if (hasOtherLangs) {
          score += 5;
        }

        return { term, score };
      });

      scoredMatches.sort((a, b) => b.score - a.score);
      fullMatch = scoredMatches[0].term;
    }

    if (fullMatch) {
      const parsedTargetLangs = (typeof targetLangs === 'string' ? targetLangs.split(',') : targetLangs).map(l => l.trim()).filter(Boolean);
      let tmTranslations = {};
      const termFields = parseJsonField(fullMatch && fullMatch.fields);

      const fieldsKeys = Object.keys(termFields);
      parsedTargetLangs.forEach(lang => {
        if (lang === '英文' || lang.includes('EN') || lang.toLowerCase() === 'english') {
          tmTranslations[lang] = typeof fullMatch.en_term === 'object' 
            ? (fullMatch.en_term?.text || JSON.stringify(fullMatch.en_term)) 
            : String(fullMatch.en_term || '');
        } else {
          const normLang = lang.replace(/语|文/g, '');
          const matchedKey = fieldsKeys.find(k => k === lang || k.includes(normLang));
          let rawVal = matchedKey ? termFields[matchedKey] : '';
          if (typeof rawVal === 'object' && rawVal !== null) {
            if (Array.isArray(rawVal)) {
              rawVal = rawVal.map(x => (typeof x === 'object' ? x?.text || '' : String(x))).join('');
            } else if (rawVal.text !== undefined) {
              rawVal = String(rawVal.text);
            } else {
              rawVal = JSON.stringify(rawVal);
            }
          }
          tmTranslations[lang] = String(rawVal || '');
        }
      });
      return res.json({ ...tmTranslations, _source: 'tm' });
    }

    let matchedTerms = [];
    glossaryTerms.forEach(term => {
      if (zhCn.includes(term.cn_term)) {
        const termFields = parseJsonField(term && term.fields);

        let targetConstraints = { "英文": term.en_term };
        Object.keys(termFields).forEach(k => {
          targetConstraints[k] = termFields[k];
        });

        matchedTerms.push({
          "中文名词": term.cn_term,
          "各语种强制翻译": targetConstraints
        });
      }
    });

    if (matchedTerms.length > 0) {
      inputs.glossary_context = JSON.stringify(matchedTerms, null, 2);
    } else {
      inputs.glossary_context = "";
    }
    // === END GLOSSARY INTERCEPTION ===

    const config = await getEffectiveDifyConfig(projectId);
    const result = await executeDifyWithFailover(config, inputs, `user_${userId}`);

    if (!result.ok) {
      const errorText = result.errorText || '';
      let cleanMsg = errorText;
      
      if (result.status === 504 || errorText.includes('504') || errorText.includes('Gateway time-out') || errorText.includes('Gateway Timeout')) {
        cleanMsg = 'Dify 接口响应超时 (HTTP 504 Gateway Timeout)。已重试全量备用引擎，请确认服务可用性。';
      } else if (result.status === 502 || errorText.includes('502 Bad Gateway')) {
        cleanMsg = 'Dify 网关响应异常 (HTTP 502 Bad Gateway)。建议在【系统设置】中切换引擎。';
      } else if (result.status === 403 || errorText.includes('403 Forbidden')) {
        cleanMsg = 'Dify 拒绝访问 (HTTP 403 Forbidden)。请检查 API Key 是否正确或已授权。';
      } else if (result.status === 401 || errorText.includes('401 Unauthorized')) {
        cleanMsg = 'Dify 校验失败 (HTTP 401 Unauthorized)。API Key 无效。';
      } else if (errorText.includes('<html') || errorText.includes('<HTML')) {
        cleanMsg = `Dify 远程服务器响应异常 (HTTP ${result.status})`;
      } else {
        try {
          const parsed = JSON.parse(errorText);
          cleanMsg = parsed?.message || parsed?.error || errorText;
        } catch {
          cleanMsg = errorText;
        }
      }

      return res.status(result.status || 500).json({ error: `Dify API 响应错误: ${cleanMsg}` });
    }

    const data = result.data;

    const workflowStatus = data.data?.status || data.status;
    const workflowError = data.data?.error || data.error;
    if (workflowStatus === 'failed' || workflowStatus === 'stopped') {
      console.error('⚠️ Dify workflow failed:', JSON.stringify({ status: workflowStatus, error: workflowError }));
      const errorStr = String(workflowError || '');
      const isRateLimit = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('rate_limit') || errorStr.includes('quota');
      const httpStatus = isRateLimit ? 429 : 500;
      return res.status(httpStatus).json({ error: `Dify 工作流执行失败 (status: ${workflowStatus}): ${workflowError || '未知错误，请检查 Dify 工作流日志'}` });
    }

    const usageTokens = data.data?.total_tokens || 0;
    const usageElapsed = data.data?.elapsed_time || 0;
    const usageStatus = data.data?.status || 'success';
    db.query(
      'INSERT INTO ai_usage_logs (user_id, project_id, term_kw, zh_cn, target_languages, total_tokens, elapsed_time, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, projectId, termKw, zhCn.slice(0, 200), targetLangs, usageTokens, usageElapsed, usageStatus]
    ).catch(err => console.error('AI用量日志写入失败:', err.message));

    let outputs = data.data?.outputs || data.outputs;
    if (!outputs || typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      if (data.data?.result || data.result) {
        outputs = { result: data.data?.result || data.result };
      } else if (data.data?.text || data.text) {
        outputs = { text: data.data?.text || data.text };
      } else if (data.data?.answer || data.answer) {
        outputs = { answer: data.data?.answer || data.answer };
      } else if (data.data?.response || data.response) {
        outputs = { response: data.data?.response || data.response };
      } else if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        outputs = data.data;
      } else {
        outputs = data;
      }
    }

    if (!outputs || typeof outputs !== 'object') {
      console.error('⚠️ Dify raw data:', JSON.stringify(data));
      return res.status(500).json({ error: `Dify 工作流未返回任何有效数据。原始响应: ${JSON.stringify(data).slice(0, 300)}` });
    }

    const outputKeys = Object.keys(outputs);
    if (outputKeys.some(k => k.includes('英') || k.includes('法') || k.includes('德') || k.includes('日') || k.includes('EN') || k.includes('FR') || k.includes('CN') || k.includes('中文'))) {
      return res.json(outputs);
    }

    let rawVal = outputs.result || outputs.translations || outputs.output || outputs.text || outputs.answer || outputs.response || outputs.res || outputs.data || outputs.json;

    if (rawVal === undefined && outputKeys.length === 1) {
      rawVal = outputs[outputKeys[0]];
    }

    if (rawVal === undefined) {
      for (const key of outputKeys) {
        const val = outputs[key];
        if (typeof val === 'string' && val.trim().startsWith('{')) {
          rawVal = val;
          break;
        }
      }
    }

    if (rawVal === undefined || rawVal === null) {
      console.error('⚠️ Dify raw response data structure:', JSON.stringify(data));
      return res.status(500).json({ 
        error: `Dify 工作流未包含有效输出变量 (当前 Dify 输出字段为: ${outputKeys.join(', ') || '无'})。原始响应片段: ${JSON.stringify(data).slice(0, 200)}` 
      });
    }

    // Robust JSON Repair & Extraction Helper (Strips DeepSeek <think> reasoning blocks)
    const tryExtractAndParseJson = (inputStr) => {
      if (!inputStr || typeof inputStr !== 'string') return null;
      let cleaned = inputStr.trim();

      // 1. Remove <think>...</think> reasoning blocks generated by DeepSeek/R1 models
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // 2. Remove markdown code blocks (```json ... ```)
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // 3. Direct JSON parse attempt
      try {
        const obj = JSON.parse(cleaned);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
      } catch {}

      // 4. Try parsing from last index of '{' to avoid matching leftover '{' inside prompt/thinking text
      const lastOpen = cleaned.lastIndexOf('{');
      const lastClose = cleaned.lastIndexOf('}');
      if (lastOpen !== -1 && lastClose > lastOpen) {
        const candidate = cleaned.slice(lastOpen, lastClose + 1);
        try {
          const obj = JSON.parse(candidate);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
        } catch {}
      }

      // 5. General regex match fallback
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const obj = JSON.parse(jsonMatch[0]);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
        } catch {}

        try {
          let repaired = jsonMatch[0]
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/(['"])?([a-zA-Z0-9_\u4e00-\u9fa5]+)\1\s*:/g, '"$2":');
          const obj = JSON.parse(repaired);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
        } catch {}
      }
      return null;
    };

    const isTranslationObj = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      const keys = Object.keys(obj);
      return keys.length > 0 && !obj.error && keys.some(k => 
        k.includes('英') || k.includes('法') || k.includes('德') || k.includes('日') || 
        k.includes('EN') || k.includes('FR') || k.includes('DE') || k.includes('ES') || 
        k.includes('CN') || k.includes('中文') || k.length <= 6
      );
    };

    if (typeof rawVal === 'object' && rawVal !== null) {
      if (rawVal.error) {
        const fallbackText = rawVal.raw_output || rawVal.text || rawVal.result || rawVal.raw || '';
        const repairedObj = tryExtractAndParseJson(fallbackText);
        if (repairedObj && isTranslationObj(repairedObj)) {
          console.log('✅ 成功从 Dify Code 节点的 raw_output 中容错解析出完整 JSON 翻译!');
          return res.json(repairedObj);
        }
        return res.status(200).json({ error: `Dify 脚本节点抛出错误: ${rawVal.error}` });
      }
      return res.json(rawVal);
    }

    const parsedObj = tryExtractAndParseJson(String(rawVal));
    if (parsedObj && typeof parsedObj === 'object') {
      if (parsedObj.error) {
        const fallbackText = parsedObj.raw_output || parsedObj.text || '';
        const repairedObj = tryExtractAndParseJson(fallbackText);
        if (repairedObj && isTranslationObj(repairedObj)) {
          console.log('✅ 成功容错修复解析 Dify raw_output JSON!');
          return res.json(repairedObj);
        }
        return res.status(200).json({ error: `Dify 脚本节点抛出错误: ${parsedObj.error}` });
      }
      return res.json(parsedObj);
    }

    res.status(500).json({ error: `解析 Dify 输出 JSON 失败。原始输出为: ${String(rawVal).slice(0, 200)}` });
  } catch (err) {
    console.error('中转 AI 翻译失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

// POST /api/projects/:projectId/generate-kw - 根据中文源词生成 KW 标识
router.post('/projects/:projectId/generate-kw', authenticateToken, requireProjectMember, async (req, res) => {
  const { projectId } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: '中文源词 (text) 不能为空' });
  }

  try {
    const generated = await generateKwHelper(projectId, text);
    res.json({ kw: generated });
  } catch (err) {
    console.error('生成 KW 失败:', err);
    res.status(500).json({ error: '生成 KW 失败，请重试。' });
  }
});

// POST /api/projects/:projectId/dify-test - 测试 Dify 连接性
router.post('/projects/:projectId/dify-test', authenticateToken, requireProjectMember, async (req, res) => {
  const { projectId } = req.params;
  const { baseUrl, apiKey } = req.body;

  const effective = await getEffectiveDifyConfig(projectId);
  const targetUrl = baseUrl || effective.baseUrl;
  let targetKey = apiKey;

  if (!targetKey || (targetUrl.includes('night.magene.cn') && targetKey === 'app-aochEehgytnJciYeI3L1pqfj')) {
    if (targetUrl.includes('night.magene.cn')) {
      targetKey = 'app-zV0Lo78Bi5WjhplWDL7OwsWR';
    } else {
      targetKey = effective.apiKey;
    }
  }

  if (!targetUrl || !targetKey) {
    return res.status(400).json({ error: 'baseUrl 和 apiKey 不能为空' });
  }

  try {
    const cleanBaseUrl = targetUrl.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/workflows/run`;

    const testInputs = {
      KW: 'KW_CONNECTION_TEST',
      text: '测试',
      context: '设置',
      target_languages: 'EN（英文）'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetKey}`
      },
      body: JSON.stringify({
        inputs: testInputs,
        response_mode: 'blocking',
        user: 'glossahub_connection_test'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let cleanMsg = errorText;
      if (response.status === 403 || errorText.includes('403 Forbidden')) {
        cleanMsg = 'HTTP 403 Forbidden (API Key 无权访问此接口，请确认 Key 是否正确)';
      } else if (response.status === 401 || errorText.includes('401 Unauthorized')) {
        cleanMsg = 'HTTP 401 Unauthorized (未授权，API Key 无效)';
      } else if (errorText.includes('<html') || errorText.includes('<HTML')) {
        cleanMsg = `HTTP 状态码 ${response.status}: 服务器拒绝连接`;
      }
      return res.status(response.status).json({ error: cleanMsg });
    }

    res.json({ success: true, message: 'Dify 引擎连接测试成功！' });
  } catch (err) {
    console.error('连接测试失败:', err);
    res.status(500).json({ error: '服务器内部错误，请稍后重试。' });
  }
});

module.exports = router;
