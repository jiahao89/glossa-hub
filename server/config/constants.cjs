/**
 * Shared backend constants for Glossa-Hub.
 *
 * TARGET_LANGUAGES is the canonical list of supported translation language columns.
 * It must match the columns stored in the `translations` JSON field and the
 * language names managed in the `languages` table.
 *
 * Frontend maintains its own copy (loaded dynamically from the API) — this is
 * the authoritative backend source used for sync/import validation.
 */
const TARGET_LANGUAGES = [
  'EN（英文）',
  'FR（法）',
  'DE（德）',
  'ES（西班牙）',
  'IT（意大利）',
  'PT（葡萄牙）',
  'KO（韩）',
  'JP（日）',
  'RU（俄罗斯）',
  'PL（波兰）',
  'TC（繁）',
  'DA（丹麦）',
  'CZ(捷克)',
  '瑞典',
  '挪威',
  '荷兰',
];

/**
 * Legacy field name → canonical TARGET_LANGUAGES name mapping.
 * Used during CSV/Excel import to normalise old-format column headers.
 */
const LEGACY_TO_NEW_LANG_MAP = {
  '英文': 'EN（英文）', 'EN': 'EN（英文）',
  '法语': 'FR（法）', 'FR': 'FR（法）', '法': 'FR（法）',
  '德语': 'DE（德）', 'DE': 'DE（德）', '德': 'DE（德）',
  '西班牙语': 'ES（西班牙）', 'ES': 'ES（西班牙）', '西班牙': 'ES（西班牙）',
  '意大利语': 'IT（意大利）', 'IT': 'IT（意大利）', '意大利': 'IT（意大利）',
  '葡萄牙语': 'PT（葡萄牙）', 'PT': 'PT（葡萄牙）', '葡萄牙': 'PT（葡萄牙）',
  '韩语': 'KO（韩）', 'KO': 'KO（韩）', '韩': 'KO（韩）',
  '日语': 'JP（日）', 'JP': 'JP（日）', '日': 'JP（日）',
  '俄语': 'RU（俄罗斯）', 'RU': 'RU（俄罗斯）', '俄罗斯': 'RU（俄罗斯）',
  '波兰语': 'PL（波兰）', 'PL': 'PL（波兰）', '波兰': 'PL（波兰）',
  '繁体': 'TC（繁）', 'TC': 'TC（繁）', '繁': 'TC（繁）', '繁体中文': 'TC（繁）',
  '丹麦语': 'DA（丹麦）', 'DA': 'DA（丹麦）', '丹麦': 'DA（丹麦）',
  '捷克语': 'CZ(捷克)', 'CZ': 'CZ(捷克)', '捷克': 'CZ(捷克)',
  '瑞典语': '瑞典',
  '挪威语': '挪威',
  '荷兰语': '荷兰',
};

module.exports = { TARGET_LANGUAGES, LEGACY_TO_NEW_LANG_MAP };
