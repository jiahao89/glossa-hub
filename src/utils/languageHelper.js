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
  if (result[targetLang] !== undefined) return result[targetLang];
  
  const codeMatch = targetLang.match(/^([A-Z]+)/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : '';
  const nameClean = targetLang.replace(/^[A-Z]+\s*[（(]?/i, '')
                              .replace(/[）)]?$/g, '')
                              .replace(/语|文/g, '')
                              .trim();

  for (const [k, v] of Object.entries(result)) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const kUpper = k.toUpperCase().trim();
    const kClean = k.replace(/[（()）]/g, '').replace(/语|文/g, '').trim();

    if (code && (kUpper === code || kUpper.startsWith(code + '_') || kUpper.startsWith(code + '-'))) {
      return v;
    }
    if (nameClean && (kClean.includes(nameClean) || nameClean.includes(kClean))) {
      return v;
    }
  }
  return undefined;
}

/**
 * Default target language labels used as fallback when a project
 * has no custom language configuration.
 */
export const DEFAULT_TARGET_LANGUAGES = [
  'EN（英文）', 'FR（法）', 'DE（德）', 'ES（西班牙）', 'IT（意大利）', 'PT（葡萄牙）', 
  'KO（韩）', 'JP（日）', 'RU（俄罗斯）', 'PL（波兰）', 'TC（繁）', 'DA（丹麦）', 
  'CZ(捷克)', '瑞典', '挪威', '荷兰'
];
