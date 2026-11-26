const { parseJsonField } = require('./jsonFields.cjs');

const NON_LANG_KEYS = new Set([
  '所在页面', '字号类别', 'KW', 'kw', 'CN（中文）', 'id', 'created_at', 'updated_at',
]);

const DIFY_WRAPPER_KEYS = new Set([
  'result', 'translations', 'output', 'text', 'answer', 'response', 'res', 'data', 'json', 'error',
]);

const CHINESE_NAME_TO_CODE = {
  英: 'EN', 中: 'CN', 简中: 'CN', 繁: 'TC', 繁体: 'TC', 繁体中: 'TC',
  法: 'FR', 德: 'DE', 西班牙: 'ES', 西: 'ES', 意大利: 'IT', 意: 'IT',
  葡萄牙: 'PT', 葡: 'PT', 韩: 'KO', 日: 'JP', 俄罗斯: 'RU', 俄: 'RU',
  波兰: 'PL', 波: 'PL', 丹麦: 'DA', 捷克: 'CZ',
  瑞典: 'SE', 挪威: 'NO', 荷兰: 'NL', 泰: 'TH',
};

const ENGLISH_NAME_TO_CODE = {
  english: 'EN', chinese: 'CN', 'traditional chinese': 'TC', 'zh-tw': 'TC', zh_tw: 'TC',
  french: 'FR', german: 'DE', spanish: 'ES', italian: 'IT', portuguese: 'PT',
  korean: 'KO', japanese: 'JP', russian: 'RU', polish: 'PL',
  danish: 'DA', czech: 'CZ', swedish: 'SE', norwegian: 'NO', dutch: 'NL',
  thai: 'TH', thailand: 'TH',
};

const CODE_ALIASES = {
  JA: 'JP', SV: 'SE', CS: 'CZ', NB: 'NO', NN: 'NO',
  TW: 'TC', CHT: 'TC', ZH_TW: 'TC',
};

const KNOWN_CODES = new Set([
  'EN', 'CN', 'TC', 'FR', 'DE', 'ES', 'IT', 'PT',
  'KO', 'JP', 'RU', 'PL', 'DA', 'CZ', 'SE', 'NO', 'NL', 'TH',
]);

/** Extract plain string from a glossary cell (string, `{ text }`, or array). */
function extractPlainString(rawVal) {
  if (rawVal === undefined || rawVal === null) return '';
  if (typeof rawVal === 'object') {
    if (Array.isArray(rawVal)) {
      return rawVal.map(x => (typeof x === 'object' ? x?.text || '' : String(x ?? ''))).join('').trim();
    }
    if (rawVal.text !== undefined) {
      return String(rawVal.text ?? '').trim();
    }
    return JSON.stringify(rawVal).trim();
  }
  return String(rawVal).trim();
}

/** Parse a language label into canonical ISO-like code and cleaned Chinese name. */
function normalizeLangDescriptor(label) {
  const str = String(label || '').trim();
  const codeMatch = str.match(/^([A-Za-z]+)/);
  const rawPrefix = codeMatch ? codeMatch[1].toUpperCase() : '';
  const nameClean = str
    .replace(/^[A-Za-z]+\s*[（(]?/i, '')
    .replace(/[）)]?$/g, '')
    .replace(/语|文/g, '')
    .trim();
  const kClean = str.replace(/[（()）]/g, '').replace(/语|文/g, '').trim();
  const prefixCode = rawPrefix.length > 0 && rawPrefix.length <= 3 ? rawPrefix : '';
  const codeFromEnglish = ENGLISH_NAME_TO_CODE[kClean.toLowerCase()] || '';
  const codeFromChinese = CHINESE_NAME_TO_CODE[nameClean] || CHINESE_NAME_TO_CODE[kClean] || '';
  const rawCode = prefixCode || codeFromEnglish || codeFromChinese || '';
  const code = CODE_ALIASES[rawCode] || rawCode;
  return { code, nameClean, kClean };
}

/** Find a non-empty translation value in `sourceObj` matching `targetLang`. */
function findMatchingNonEmptyValue(sourceObj, targetLang) {
  if (!sourceObj || typeof sourceObj !== 'object') return '';
  const direct = extractPlainString(sourceObj[targetLang]);
  if (direct) return direct;

  const target = normalizeLangDescriptor(targetLang);
  for (const [k, raw] of Object.entries(sourceObj)) {
    if (!k || k.startsWith('_') || k === 'error' || NON_LANG_KEYS.has(k)) continue;
    const val = extractPlainString(raw);
    if (!val) continue;

    const candidate = normalizeLangDescriptor(k);
    if (target.code && candidate.code && (
      candidate.code === target.code
      || candidate.code.startsWith(`${target.code}_`)
      || candidate.code.startsWith(`${target.code}-`)
    )) {
      return val;
    }
    if (target.nameClean && candidate.kClean && (
      candidate.kClean.includes(target.nameClean) || target.nameClean.includes(candidate.kClean)
    )) {
      return val;
    }
  }
  return '';
}

/**
 * Parse comma/array target_languages input into an ordered list of trimmed labels.
 */
function parseTargetLanguages(targetLangs) {
  if (Array.isArray(targetLangs)) {
    return targetLangs.map(l => String(l || '').trim()).filter(Boolean);
  }
  if (typeof targetLangs === 'string') {
    return targetLangs.split(',').map(l => l.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Resolve translations from an exact-match glossary row (`fullMatch`).
 *
 * Unlike the previous unconditional bypass, this distinguishes languages that
 * actually have non-empty glossary entries (`tmTranslations`) from requested
 * languages missing in the glossary (`missingFromGlossary`), so callers can
 * fall through to AI translation for missing languages instead of returning
 * empty strings.
 */
function resolveGlossaryTranslations(fullMatch, targetLangs, inputs = {}) {
  const parsedTargetLangs = parseTargetLanguages(targetLangs);
  const termFields = parseJsonField(fullMatch && fullMatch.fields);
  const glossarySource = {};

  Object.entries(termFields || {}).forEach(([k, v]) => {
    if (NON_LANG_KEYS.has(k)) return;
    const val = extractPlainString(v);
    if (val) glossarySource[k] = val;
  });

  const enVal = extractPlainString(fullMatch && fullMatch.en_term);
  if (enVal && !glossarySource['EN（英文）'] && !glossarySource['英文']) {
    glossarySource['EN（英文）'] = enVal;
  }

  const tmTranslations = {};
  const missingFromGlossary = [];

  if (parsedTargetLangs.length === 0) {
    Object.assign(tmTranslations, glossarySource);
  } else {
    parsedTargetLangs.forEach(lang => {
      const matchedVal = findMatchingNonEmptyValue(glossarySource, lang);
      if (matchedVal) {
        tmTranslations[lang] = matchedVal;
      } else {
        missingFromGlossary.push(lang);
      }
    });
  }

  // Respect caller's existing translations when preserve_existing is enabled
  if (inputs.preserve_existing !== false && inputs.existing_translations && typeof inputs.existing_translations === 'object') {
    Object.entries(inputs.existing_translations).forEach(([k, v]) => {
      const trimmed = extractPlainString(v);
      if (!trimmed) return;
      const existingTarget = normalizeLangDescriptor(k);
      const matchedKey = Object.keys(tmTranslations).find(tk => {
        if (tk === k) return true;
        const tkDesc = normalizeLangDescriptor(tk);
        return (existingTarget.code && tkDesc.code === existingTarget.code)
          || (existingTarget.nameClean && tkDesc.nameClean === existingTarget.nameClean);
      });
      if (matchedKey) {
        tmTranslations[matchedKey] = trimmed;
      } else if (missingFromGlossary.length === 0) {
        tmTranslations[k] = trimmed;
      }
    });
  }

  const isComplete = parsedTargetLangs.length > 0
    ? missingFromGlossary.length === 0
    : Object.keys(tmTranslations).length > 0;

  return {
    parsedTargetLangs,
    tmTranslations,
    missingFromGlossary,
    glossarySource,
    isComplete,
  };
}

/**
 * Build `glossary_context` constraints for Dify from partial glossary matches,
 * an incomplete exact match (if any), and caller's existing translations.
 */
function buildMatchedGlossaryTerms(glossaryTerms, zhCn, fullMatch, existingTranslations, fullMatchSource) {
  const matchedTerms = [];

  if (fullMatch && fullMatchSource && Object.keys(fullMatchSource).length > 0) {
    matchedTerms.push({
      中文名词: zhCn,
      各语种强制翻译: fullMatchSource,
      重要规则: '词库中已录入了该词条的部分语种标准译文，请仅补全缺失语种并与已有语种严格保持语义一致',
    });
  }

  (glossaryTerms || []).forEach(term => {
    const cn = (term.cn_term || '').trim();
    if (cn.length >= 2 && zhCn.includes(cn) && (!fullMatch || cn !== zhCn)) {
      const termFields = parseJsonField(term && term.fields);
      const targetConstraints = {};
      if (term.en_term) targetConstraints['英文'] = term.en_term;
      Object.keys(termFields).forEach(k => {
        if (!NON_LANG_KEYS.has(k) && termFields[k]) {
          targetConstraints[k] = termFields[k];
        }
      });
      if (Object.keys(targetConstraints).length > 0) {
        matchedTerms.push({
          中文名词: cn,
          各语种强制翻译: targetConstraints,
        });
      }
    }
  });

  if (existingTranslations && typeof existingTranslations === 'object' && Object.keys(existingTranslations).length > 0) {
    matchedTerms.unshift({
      中文名词: zhCn,
      各语种强制翻译: existingTranslations,
      重要规则: '当前词条已确认的现有翻译，请严格保持各目标语种含义与已有翻译对齐，切勿纠正或修改已有翻译',
    });
  }

  return matchedTerms;
}

/**
 * Return true if `key` looks like a language column/code or matches a requested target language,
 * never mistaking standard Dify workflow wrapper variable names for languages.
 */
function isKnownLanguageKey(key, parsedTargetLangs = []) {
  if (!key || DIFY_WRAPPER_KEYS.has(key.toLowerCase()) || key.startsWith('_')) return false;
  if (parsedTargetLangs.some(lang => lang === key)) return true;

  const desc = normalizeLangDescriptor(key);
  if (desc.code && KNOWN_CODES.has(desc.code)) return true;
  if (desc.nameClean && CHINESE_NAME_TO_CODE[desc.nameClean]) return true;
  return parsedTargetLangs.some(lang => {
    const targetDesc = normalizeLangDescriptor(lang);
    return (targetDesc.code && desc.code === targetDesc.code)
      || (targetDesc.nameClean && desc.nameClean === targetDesc.nameClean);
  });
}

function isTranslationObj(obj, parsedTargetLangs = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0 || obj.error) return false;
  return keys.some(k => isKnownLanguageKey(k, parsedTargetLangs) || k.length <= 6);
}

/**
 * Strip DeepSeek `<think>` blocks / markdown fences and parse a JSON object.
 */
function tryExtractAndParseJson(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return null;
  let cleaned = inputStr.trim();

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/已深度思考[\s\S]*?(?=\{|$)/gi, '').trim();
  cleaned = cleaned.replace(/Thinking Process:[\s\S]*?(?=\{|$)/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  } catch {}

  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose > firstOpen) {
    const candidate = cleaned.slice(firstOpen, lastClose + 1);
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch {}

    try {
      const repaired = candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_\u4e00-\u9fa5]+)\1\s*:/g, '"$2":');
      const obj = JSON.parse(repaired);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch {}
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch {}

    try {
      const repaired = jsonMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_\u4e00-\u9fa5]+)\1\s*:/g, '"$2":');
      const obj = JSON.parse(repaired);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch {}
  }
  return null;
}

/**
 * Parse Dify workflow response data into a flat `{ [lang]: translation }` object.
 * Returns `{ ok: true, resultObj }` or `{ ok: false, status: 500, error: string }`.
 */
function parseDifyWorkflowOutputs(data, parsedTargetLangs = []) {
  let outputs = data?.data?.outputs || data?.outputs;
  if (!outputs || typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
    if (data?.data?.result || data?.result) {
      outputs = { result: data?.data?.result || data?.result };
    } else if (data?.data?.text || data?.text) {
      outputs = { text: data?.data?.text || data?.text };
    } else if (data?.data?.answer || data?.answer) {
      outputs = { answer: data?.data?.answer || data?.answer };
    } else if (data?.data?.response || data?.response) {
      outputs = { response: data?.data?.response || data?.response };
    } else if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      outputs = data.data;
    } else {
      outputs = data;
    }
  }

  if (!outputs || typeof outputs !== 'object') {
    return {
      ok: false,
      status: 500,
      error: `Dify 工作流未返回任何有效数据。原始响应: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }

  const outputKeys = Object.keys(outputs);
  if (outputKeys.some(k => isKnownLanguageKey(k, parsedTargetLangs))) {
    return { ok: true, resultObj: outputs };
  }

  let rawVal = outputs.result || outputs.translations || outputs.output || outputs.text
    || outputs.answer || outputs.response || outputs.res || outputs.data || outputs.json;

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
    return {
      ok: false,
      status: 500,
      error: `Dify 工作流未包含有效输出变量 (当前 Dify 输出字段为: ${outputKeys.join(', ') || '无'})。原始响应片段: ${JSON.stringify(data).slice(0, 200)}`,
    };
  }

  if (typeof rawVal === 'object' && rawVal !== null) {
    if (rawVal.error) {
      const fallbackText = rawVal.raw_output || rawVal.text || rawVal.result || rawVal.raw || '';
      const repairedObj = tryExtractAndParseJson(fallbackText);
      if (repairedObj && isTranslationObj(repairedObj, parsedTargetLangs)) {
        return { ok: true, resultObj: repairedObj };
      }
      return { ok: false, status: 500, error: `Dify 脚本节点抛出错误: ${rawVal.error}` };
    }
    return { ok: true, resultObj: rawVal };
  }

  const parsedObj = tryExtractAndParseJson(String(rawVal));
  if (parsedObj && typeof parsedObj === 'object') {
    if (parsedObj.error) {
      const fallbackText = parsedObj.raw_output || parsedObj.text || '';
      const repairedObj = tryExtractAndParseJson(fallbackText);
      if (repairedObj && isTranslationObj(repairedObj, parsedTargetLangs)) {
        return { ok: true, resultObj: repairedObj };
      }
      return { ok: false, status: 500, error: `Dify 脚本节点抛出错误: ${parsedObj.error}` };
    }
    return { ok: true, resultObj: parsedObj };
  }

  return {
    ok: false,
    status: 500,
    error: `解析 Dify 输出 JSON 失败。原始输出为: ${String(rawVal).slice(0, 200)}`,
  };
}

module.exports = {
  NON_LANG_KEYS,
  extractPlainString,
  normalizeLangDescriptor,
  findMatchingNonEmptyValue,
  parseTargetLanguages,
  resolveGlossaryTranslations,
  buildMatchedGlossaryTerms,
  isKnownLanguageKey,
  isTranslationObj,
  tryExtractAndParseJson,
  parseDifyWorkflowOutputs,
};
