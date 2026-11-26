/**
 * Fuzzy-match a translation for a given target language key from an AI result object.
 *
 * The AI may return keys like "EN", "English", "EN（英文）", etc.
 * This helper first tries an exact match, then falls back to language-code
 * prefix matching and Chinese-name substring matching.
 *
 * @param {Object} result - The translation result object (key → translated string).
 * @param {string} targetLang - The target language label, e.g. "EN（英文）".
 * @returns {string|undefined} The matched translation value, or undefined.
 */
export function findTranslationForLang(result, targetLang) {
  if (!result || typeof result !== 'object') return undefined;
  if (
    result[targetLang] !== undefined
    && result[targetLang] !== null
    && String(result[targetLang]).trim() !== ''
  ) {
    return result[targetLang];
  }

  const nameClean = String(targetLang)
    .replace(/^[A-Za-z]+\s*[（(]?/i, '')
    .replace(/[）)]?$/g, '')
    .replace(/语|文/g, '')
    .trim();
  const targetClean = String(targetLang).replace(/[（()）]/g, '').replace(/语|文/g, '').trim();
  const codeMatch = String(targetLang).match(/^([A-Za-z]+)/);
  const rawCode = codeMatch
    ? codeMatch[1].toUpperCase()
    : (CHINESE_NAME_TO_CODE[nameClean] || CHINESE_NAME_TO_CODE[targetClean] || ENGLISH_NAME_TO_CODE[kLower(targetClean)] || '');
  const code = CODE_ALIASES[rawCode] || rawCode;

  for (const [k, v] of Object.entries(result)) {
    if (!k || k.startsWith('_') || k === 'error') continue;
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const kClean = k.replace(/[（()）]/g, '').replace(/语|文/g, '').trim();

    // Extract the code prefix from the key too, so "EN（英文）" matches target "EN".
    // Only short prefixes (≤3 chars) count as codes; longer words are language names.
    const kCodeMatch = k.match(/^([A-Za-z]+)/);
    const kCodeRaw = kCodeMatch ? kCodeMatch[1].toUpperCase() : '';
    const kCode = kCodeRaw.length > 0 && kCodeRaw.length <= 3 ? kCodeRaw : '';
    // Map common English / Chinese language names to codes, so "TH" / "Thai" matches "泰语"
    const kCodeFromName = ENGLISH_NAME_TO_CODE[kLower(kClean)]
      || CHINESE_NAME_TO_CODE[kClean]
      || '';
    const kCodeResolved = CODE_ALIASES[kCode || kCodeFromName] || (kCode || kCodeFromName);

    if (code && kCodeResolved && (kCodeResolved === code
      || kCodeResolved.startsWith(code + '_') || kCodeResolved.startsWith(code + '-'))) {
      return v;
    }
    if (nameClean && (kClean.includes(nameClean) || nameClean.includes(kClean))) {
      return v;
    }
  }
  return undefined;
}

function kLower(s) {
  return String(s).toLowerCase().trim();
}

/** Common Chinese language names mapped to canonical ISO-like codes. */
const CHINESE_NAME_TO_CODE = {
  英: 'EN', 中: 'CN', 简中: 'CN', 繁: 'TC', 繁体: 'TC', 繁体中: 'TC',
  法: 'FR', 德: 'DE', 西班牙: 'ES', 西: 'ES', 意大利: 'IT', 意: 'IT',
  葡萄牙: 'PT', 葡: 'PT', 韩: 'KO', 日: 'JP', 俄罗斯: 'RU', 俄: 'RU',
  波兰: 'PL', 波: 'PL', 丹麦: 'DA', 捷克: 'CZ',
  瑞典: 'SE', 挪威: 'NO', 荷兰: 'NL', 泰: 'TH',
};

/** Equivalent ISO-639-1 / regional codes mapped to canonical GlossaHub codes. */
const CODE_ALIASES = {
  JA: 'JP', SV: 'SE', CS: 'CZ', NB: 'NO', NN: 'NO',
  TW: 'TC', CHT: 'TC', ZH_TW: 'TC',
};

/** Common English language names the AI may return, mapped to ISO-like codes. */
const ENGLISH_NAME_TO_CODE = {
  english: 'EN', chinese: 'CN', 'traditional chinese': 'TC', 'zh-tw': 'TC', zh_tw: 'TC',
  french: 'FR', german: 'DE', spanish: 'ES', italian: 'IT', portuguese: 'PT',
  korean: 'KO', japanese: 'JP', russian: 'RU', polish: 'PL',
  danish: 'DA', czech: 'CZ', swedish: 'SE', norwegian: 'NO', dutch: 'NL',
  thai: 'TH', thailand: 'TH',
};

/**
 * Default target language labels used as fallback when a project
 * has no custom language configuration.
 */
export const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰', '泰语'
];

/**
 * Extract existing non-empty translations from a fields or row object.
 *
 * @param {Object} fieldsOrRow - Source fields or row.
 * @param {Array<string>} targetLanguages - List of target languages to check.
 * @returns {Record<string, string>} Map of language label to existing non-empty translation string.
 */
export function extractExistingTranslations(fieldsOrRow = {}, targetLanguages = []) {
  if (!fieldsOrRow || typeof fieldsOrRow !== 'object') return {};
  const existing = {};

  targetLanguages.forEach(lang => {
    const val = fieldsOrRow[lang];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      existing[lang] = String(val).trim();
    }
  });

  return existing;
}

/**
 * Format existing translations into a reference string for AI context.
 *
 * @param {Record<string, string>} existingTranslations - Map of language label to translation.
 * @returns {string} Formatted context snippet, e.g. "已有现存翻译参考(保持一致，不予纠正): EN（英文）=\"Cadence\"".
 */
export function formatExistingReferenceContext(existingTranslations = {}) {
  if (!existingTranslations || typeof existingTranslations !== 'object') return '';
  const entries = Object.entries(existingTranslations).filter(([, v]) => v && String(v).trim());
  if (entries.length === 0) return '';
  const formatted = entries.map(([lang, val]) => `${lang}="${String(val).trim()}"`).join('; ');
  return `已有现存翻译参考(保持一致，不予纠正): ${formatted}`;
}

/**
 * Merge AI translation results into current fields.
 * If preserveExisting is true (default), any language that already has a non-empty
 * translation will NOT be overwritten or corrected.
 *
 * @param {Object} params
 * @param {Object} params.currentFields - Current fields or row object.
 * @param {Object} params.aiResult - Raw translation result from AI / TM.
 * @param {Array<string>} params.targetLanguages - List of target language labels.
 * @param {boolean} [params.preserveExisting=true] - Whether to preserve existing non-empty translations.
 * @returns {{ updatedFields: Object, changedCount: number, preservedCount: number }}
 */
export function mergeTranslations({ currentFields = {}, aiResult = {}, targetLanguages = [], preserveExisting = true }) {
  const updatedFields = { ...currentFields };
  let changedCount = 0;
  let preservedCount = 0;

  targetLanguages.forEach(lang => {
    const existingVal = currentFields[lang];
    const hasExisting = existingVal !== undefined && existingVal !== null && String(existingVal).trim() !== '';

    if (preserveExisting && hasExisting) {
      preservedCount++;
      return;
    }

    const aiVal = findTranslationForLang(aiResult, lang);
    if (aiVal !== undefined && aiVal !== null && String(aiVal).trim() !== '') {
      updatedFields[lang] = String(aiVal).trim();
      changedCount++;
    }
  });

  return { updatedFields, changedCount, preservedCount };
}

/**
 * Build preview items for batch AI translation, distinguishing active missing
 * languages from languages excluded by the current table's scope.
 *
 * When `includeExcludedOnly` is true (e.g. user explicitly checked rows), or
 * when no records have active missing languages (`activeCount === 0`) while at
 * least one record still has excluded missing languages, excluded-only records
 * are retained so the modal can still open and let the user restore languages.
 *
 * @param {Object} params
 * @param {Array<Object>} params.records - Candidate records to evaluate.
 * @param {Array<string>} params.targetLanguages - Full project target languages.
 * @param {Set<string>|Array<string>} [params.excludedLangs] - Currently excluded languages.
 * @param {boolean} [params.includeExcludedOnly=false] - Retain records missing only excluded languages.
 * @param {Map<string, Object>} [params.previousById] - Existing preview items keyed by recordId.
 * @returns {{
 *   items: Array<Object>,
 *   hasAnyIncomplete: boolean,
 *   hasEmptySourceOnly: boolean,
 *   activeCount: number,
 *   excludedOnlyCount: number
 * }}
 */
export function buildBatchTranslatePreview({
  records = [],
  targetLanguages = [],
  excludedLangs = new Set(),
  includeExcludedOnly = false,
  previousById = new Map(),
}) {
  const excludedSet = excludedLangs instanceof Set
    ? excludedLangs
    : new Set(Array.isArray(excludedLangs) ? excludedLangs : []);
  const langs = Array.isArray(targetLanguages) ? targetLanguages : [];
  const candidateList = Array.isArray(records) ? records : [];

  let withZhCount = 0;
  let emptyZhCount = 0;
  const incompleteCandidates = [];

  candidateList.forEach(r => {
    const fields = r?.fields || {};
    const zhCn = (fields['CN（中文）'] || '').trim();
    if (!zhCn) {
      emptyZhCount++;
      return;
    }
    withZhCount++;

    const allMissingLangs = langs.filter(
      lang => !fields[lang] || String(fields[lang]).trim() === ''
    );
    if (allMissingLangs.length === 0) return;

    const missingLangs = allMissingLangs.filter(lang => !excludedSet.has(lang));
    const excludedMissingLangs = allMissingLangs.filter(lang => excludedSet.has(lang));
    const recordId = r.recordId || r.id;
    const prev = previousById instanceof Map ? previousById.get(recordId) : undefined;

    incompleteCandidates.push({
      recordId,
      KW: fields['KW'] || '',
      '中文': zhCn,
      '所在页面': fields['所在页面'] || '',
      existingFields: fields,
      missingLangs,
      excludedMissingLangs,
      allMissingLangs,
      translations: prev?.translations || {},
      ...(prev?.tmMatch ? { tmMatch: true } : {}),
    });
  });

  if (incompleteCandidates.length === 0) {
    return {
      items: [],
      hasAnyIncomplete: false,
      hasEmptySourceOnly: withZhCount === 0 && emptyZhCount > 0,
      activeCount: 0,
      excludedOnlyCount: 0,
    };
  }

  const activeItems = incompleteCandidates.filter(item => item.missingLangs.length > 0);
  const excludedOnlyCount = incompleteCandidates.length - activeItems.length;
  const items = (includeExcludedOnly || activeItems.length === 0)
    ? incompleteCandidates
    : activeItems;

  return {
    items,
    hasAnyIncomplete: true,
    hasEmptySourceOnly: false,
    activeCount: activeItems.length,
    excludedOnlyCount,
  };
}


