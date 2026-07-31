const { db } = require('../config/db.cjs');

const DEFAULT_DIFY_CONFIG = {
  baseUrl: process.env.DIFY_BASE_URL || 'https://night.magene.cn/v1',
  apiKey: process.env.DIFY_API_KEY || 'app-zV0Lo78Bi5WjhplWDL7OwsWR'
};

async function getEffectiveDifyConfig(projectId) {
  try {
    const project = await db.queryOne('SELECT dify_config FROM projects WHERE id = $1', [projectId]);
    if (project && project.dify_config) {
      let cfg = {};
      if (typeof project.dify_config === 'object') {
        cfg = project.dify_config;
      } else {
        cfg = JSON.parse(project.dify_config || '{}');
      }
      if (cfg.baseUrl) {
        let apiKey = cfg.apiKey;
        // Auto-correct if URL is night.magene.cn but key is empty or old invalid key
        if (cfg.baseUrl.includes('night.magene.cn')) {
          if (!apiKey || apiKey === 'app-aochEehgytnJciYeI3L1pqfj') {
            apiKey = 'app-zV0Lo78Bi5WjhplWDL7OwsWR';
          }
        }
        if (apiKey) {
          return { baseUrl: cfg.baseUrl, apiKey, isCustom: true };
        }
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_DIFY_CONFIG, isCustom: false };
}

async function generateKwHelper(projectId, text) {
  if (!text || !text.trim()) return '';

  let englishText = '';

  // 1. Try Dify first if config has apiKey
  try {
    const config = await getEffectiveDifyConfig(projectId);
    if (config.apiKey) {
      const cleanBaseUrl = config.baseUrl.replace(/\/$/, '');
      const url = `${cleanBaseUrl}/workflows/run`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          inputs: {
            KW: 'KW_GENERATE_TEMP',
            text: text.trim(),
            context: '自动生成键名',
            target_languages: 'EN（英文）'
          },
          response_mode: 'blocking',
          user: 'glossahub_generate_kw'
        })
      });

      if (response.ok) {
        const data = await response.ok ? await response.json() : null;
        if (data && data.status !== 'failed' && data.data?.outputs) {
          const outputs = data.data.outputs;
          const resultStr = outputs.result || outputs.translations;
          if (resultStr) {
            try {
              const parsed = JSON.parse(resultStr);
              const keys = Object.keys(parsed);
              const enKey = keys.find(k => k.toLowerCase().includes('en') || k.toLowerCase().includes('英') || k.toLowerCase().includes('english'));
              if (enKey && parsed[enKey]) {
                englishText = parsed[enKey];
              }
            } catch {
              // ignore parse error
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Dify KW generation failed, falling back to Google Translate:', err.message);
  }

  // 2. Fallback to Google Translate if Dify didn't work or returned empty
  if (!englishText) {
    try {
      const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(text.trim())}`;
      const response = await fetch(googleUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          englishText = data[0][0][0];
        }
      }
    } catch (err) {
      console.error('Google Translate fallback failed:', err.message);
    }
  }

  if (!englishText) {
    englishText = 'AUTO_GEN_' + Date.now();
  }

  let clean = englishText
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/[\s-_]+/g, '_')
    .toUpperCase();

  if (!clean.startsWith('KW_')) {
    clean = 'KW_' + clean;
  }
  return clean;
}

module.exports = {
  DEFAULT_DIFY_CONFIG,
  getEffectiveDifyConfig,
  generateKwHelper
};
