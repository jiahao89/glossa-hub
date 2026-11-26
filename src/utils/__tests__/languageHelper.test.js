import { describe, it, expect } from 'vitest';
import { 
  findTranslationForLang,
  extractExistingTranslations,
  formatExistingReferenceContext,
  mergeTranslations,
  buildBatchTranslatePreview
} from '../languageHelper';

describe('findTranslationForLang', () => {
  it('exact match wins', () => {
    expect(findTranslationForLang({ 'EN（英文）': 'hello' }, 'EN（英文）')).toBe('hello');
  });

  it('matches bare code key to decorated target', () => {
    expect(findTranslationForLang({ EN: 'hello' }, 'EN（英文）')).toBe('hello');
  });

  it('matches English name key to decorated target', () => {
    expect(findTranslationForLang({ English: 'hello' }, 'EN（英文）')).toBe('hello');
  });

  it('matches decorated key to bare-code target (reverse direction)', () => {
    expect(findTranslationForLang({ 'EN（英文）': 'hello' }, 'EN')).toBe('hello');
  });

  it('matches Chinese-name-only target (瑞典)', () => {
    expect(findTranslationForLang({ '瑞典语': 'hej' }, '瑞典')).toBe('hej');
  });

  it('skips empty/null values', () => {
    expect(findTranslationForLang({ EN: '', EN_US: null }, 'EN（英文）')).toBeUndefined();
  });

  it('returns undefined for null result or no match', () => {
    expect(findTranslationForLang(null, 'EN（英文）')).toBeUndefined();
    expect(findTranslationForLang({ FR: 'bonjour' }, 'EN（英文）')).toBeUndefined();
  });

  it('does not cross-match unrelated languages', () => {
    // ES must not match target EN via name substring
    expect(findTranslationForLang({ ES: 'hola' }, 'EN（英文）')).toBeUndefined();
  });

  it('matches Thai, Swedish, Norwegian, Dutch, Japanese, and Czech across ISO codes and English names', () => {
    expect(findTranslationForLang({ TH: 'ปิด' }, '泰语')).toBe('ปิด');
    expect(findTranslationForLang({ th: 'เรดาร์' }, '泰语')).toBe('เรดาร์');
    expect(findTranslationForLang({ Thai: 'ปิด' }, '泰语')).toBe('ปิด');
    expect(findTranslationForLang({ 'TH（泰语）': 'ปิด' }, '泰语')).toBe('ปิด');
    expect(findTranslationForLang({ '泰语': '', TH: 'ปิด' }, '泰语')).toBe('ปิด');

    expect(findTranslationForLang({ SV: 'Av' }, '瑞典')).toBe('Av');
    expect(findTranslationForLang({ Swedish: 'Av' }, '瑞典')).toBe('Av');
    expect(findTranslationForLang({ NB: 'Av' }, '挪威')).toBe('Av');
    expect(findTranslationForLang({ NL: 'Uit' }, '荷兰')).toBe('Uit');
    expect(findTranslationForLang({ JA: 'オフ' }, 'JP（日）')).toBe('オフ');
    expect(findTranslationForLang({ CS: 'Vypnuto' }, 'CZ(捷克)')).toBe('Vypnuto');
  });

  it('ignores internal metadata keys such as _source and error', () => {
    expect(findTranslationForLang({ _source: 'tm', error: 'none' }, 'EN（英文）')).toBeUndefined();
  });
});

describe('extractExistingTranslations', () => {
  it('extracts non-empty translations for specified target languages', () => {
    const fields = {
      'CN（中文）': '踏频',
      'EN（英文）': 'Cadence',
      'FR（法）': ' ',
      'DE（德）': 'Trittfrequenz',
      'KW': 'KW_CADENCE'
    };
    const targetLangs = ['EN（英文）', 'FR（法）', 'DE（德）', 'JA（日）'];
    const result = extractExistingTranslations(fields, targetLangs);
    expect(result).toEqual({
      'EN（英文）': 'Cadence',
      'DE（德）': 'Trittfrequenz'
    });
  });

  it('returns empty object when fields or targetLanguages are empty', () => {
    expect(extractExistingTranslations(null, ['EN'])).toEqual({});
    expect(extractExistingTranslations({}, ['EN'])).toEqual({});
    expect(extractExistingTranslations({ EN: 'Hi' }, [])).toEqual({});
  });
});

describe('formatExistingReferenceContext', () => {
  it('formats existing translations into prompt context', () => {
    const existing = {
      'EN（英文）': 'Cadence',
      'DE（德）': 'Trittfrequenz'
    };
    const formatted = formatExistingReferenceContext(existing);
    expect(formatted).toContain('已有现存翻译参考');
    expect(formatted).toContain('EN（英文）="Cadence"');
    expect(formatted).toContain('DE（德）="Trittfrequenz"');
  });

  it('returns empty string if no existing translations', () => {
    expect(formatExistingReferenceContext({})).toBe('');
    expect(formatExistingReferenceContext(null)).toBe('');
  });
});

describe('mergeTranslations', () => {
  const targetLanguages = ['EN（英文）', 'FR（法）', 'DE（德）'];

  it('默认 preserveExisting=true 时，绝不纠正或覆盖已存在的翻译', () => {
    const currentFields = {
      'CN（中文）': '踏频',
      'EN（英文）': 'Cadence', // 已有翻译
      'FR（法）': '',
      'DE（德）': null
    };
    const aiResult = {
      'EN': 'Pedal frequency', // AI 给出了不同的英语翻译
      'FR': 'Cadence FR',
      'DE': 'Trittfrequenz'
    };

    const { updatedFields, changedCount, preservedCount } = mergeTranslations({
      currentFields,
      aiResult,
      targetLanguages,
      preserveExisting: true
    });

    // 默认不纠正已存在的英语翻译
    expect(updatedFields['EN（英文）']).toBe('Cadence');
    // 空白的法语和德语被填入
    expect(updatedFields['FR（法）']).toBe('Cadence FR');
    expect(updatedFields['DE（德）']).toBe('Trittfrequenz');
    expect(preservedCount).toBe(1);
    expect(changedCount).toBe(2);
  });

  it('当 preserveExisting=false 时，允许覆盖所有语种', () => {
    const currentFields = {
      'CN（中文）': '踏频',
      'EN（英文）': 'Cadence',
      'FR（法）': 'Old FR'
    };
    const aiResult = {
      'EN': 'Pedal frequency',
      'FR': 'New FR'
    };

    const { updatedFields, changedCount, preservedCount } = mergeTranslations({
      currentFields,
      aiResult,
      targetLanguages,
      preserveExisting: false
    });

    expect(updatedFields['EN（英文）']).toBe('Pedal frequency');
    expect(updatedFields['FR（法）']).toBe('New FR');
    expect(preservedCount).toBe(0);
    expect(changedCount).toBe(2);
  });
});

describe('buildBatchTranslatePreview', () => {
  const langs = ['EN（英文）', 'FR（法）', '泰语'];

  it('retains records missing only excluded languages when activeCount is 0 (prevents modal deadlock)', () => {
    const records = [
      {
        recordId: 'rec-9',
        fields: { KW: 'KW_OFF', 'CN（中文）': '关闭', 'EN（英文）': 'off', 'FR（法）': 'Arrêt', '泰语': '' }
      },
      {
        recordId: 'rec-10',
        fields: { KW: 'KW_RADAR', 'CN（中文）': '雷达', 'EN（英文）': 'Radar', 'FR（法）': 'Radar', '泰语': '' }
      }
    ];

    const res = buildBatchTranslatePreview({
      records,
      targetLanguages: langs,
      excludedLangs: new Set(['泰语']),
      includeExcludedOnly: false,
    });

    expect(res.hasAnyIncomplete).toBe(true);
    expect(res.activeCount).toBe(0);
    expect(res.excludedOnlyCount).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].missingLangs).toEqual([]);
    expect(res.items[0].excludedMissingLangs).toEqual(['泰语']);
  });

  it('keeps excluded-only selected rows in selection mode while still separating active vs excluded missing langs', () => {
    const records = [
      {
        recordId: 'rec-1',
        fields: { 'CN（中文）': '开启', 'EN（英文）': 'On', 'FR（法）': '', '泰语': '' }
      },
      {
        recordId: 'rec-2',
        fields: { 'CN（中文）': '关闭', 'EN（英文）': 'off', 'FR（法）': 'Arrêt', '泰语': '' }
      }
    ];

    const selectionRes = buildBatchTranslatePreview({
      records,
      targetLanguages: langs,
      excludedLangs: new Set(['泰语']),
      includeExcludedOnly: true,
    });
    expect(selectionRes.items).toHaveLength(2);
    expect(selectionRes.activeCount).toBe(1);
    expect(selectionRes.excludedOnlyCount).toBe(1);
    expect(selectionRes.items[0].missingLangs).toEqual(['FR（法）']);
    expect(selectionRes.items[1].missingLangs).toEqual([]);

    const tableRes = buildBatchTranslatePreview({
      records,
      targetLanguages: langs,
      excludedLangs: new Set(['泰语']),
      includeExcludedOnly: false,
    });
    expect(tableRes.items).toHaveLength(1);
    expect(tableRes.items[0].recordId).toBe('rec-1');
  });

  it('returns hasAnyIncomplete=false only when every target language is filled', () => {
    const records = [
      {
        recordId: 'rec-done',
        fields: { 'CN（中文）': '已复制', 'EN（英文）': 'Copied', 'FR（法）': 'Copié', '泰语': 'คัดลอกแล้ว' }
      }
    ];
    const res = buildBatchTranslatePreview({
      records,
      targetLanguages: langs,
      excludedLangs: new Set(['泰语']),
      includeExcludedOnly: true,
    });
    expect(res.hasAnyIncomplete).toBe(false);
    expect(res.hasEmptySourceOnly).toBe(false);
    expect(res.items).toEqual([]);
  });

  it('flags empty Chinese source records accurately', () => {
    const records = [
      { recordId: 'rec-no-cn', fields: { 'CN（中文）': '   ', 'EN（英文）': '' } }
    ];
    const res = buildBatchTranslatePreview({ records, targetLanguages: langs });
    expect(res.hasAnyIncomplete).toBe(false);
    expect(res.hasEmptySourceOnly).toBe(true);
  });
});


