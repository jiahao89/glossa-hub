const {
  resolveGlossaryTranslations,
  buildMatchedGlossaryTerms,
  parseDifyWorkflowOutputs,
  isKnownLanguageKey,
} = require('../utils/translationHelper.cjs');

describe('server/utils/translationHelper', () => {
  const legacyGlossaryClose = {
    cn_term: '关闭',
    en_term: 'close',
    fields: JSON.stringify({
      所在页面: '赛段结算弹窗',
      KW: 'KW_RIDE_RACE_STAGE_COMPLETED_CLOSE',
      'CN（中文）': '关闭',
      'EN（英文）': 'close',
      'FR（法）': 'fermer',
      'DE（德）': 'schließen',
      '荷兰': 'sluiten',
    }),
  };

  it('does NOT mark glossary match as complete when requested Thai is missing (fixes 0-success/2-failed)', () => {
    const resolved = resolveGlossaryTranslations(
      legacyGlossaryClose,
      ['泰语'],
      {
        preserve_existing: true,
        existing_translations: { 'EN（英文）': 'off', 'FR（法）': 'Arrêt' },
      }
    );

    expect(resolved.isComplete).toBe(false);
    expect(resolved.missingFromGlossary).toEqual(['泰语']);
    expect(resolved.tmTranslations).toEqual({});
    expect(resolved.glossarySource['EN（英文）']).toBe('close');
    expect(resolved.glossarySource['荷兰']).toBe('sluiten');
  });

  it('splits partial glossary hit (EN present, Thai missing) so AI only translates missing Thai', () => {
    const resolved = resolveGlossaryTranslations(
      legacyGlossaryClose,
      ['EN（英文）', '泰语'],
      {}
    );

    expect(resolved.isComplete).toBe(false);
    expect(resolved.tmTranslations).toEqual({ 'EN（英文）': 'close' });
    expect(resolved.missingFromGlossary).toEqual(['泰语']);
  });

  it('marks glossary match as complete when all requested languages exist in glossary', () => {
    const resolved = resolveGlossaryTranslations(
      { cn_term: '踏频传感器', en_term: 'Cadence Sensor', fields: '{"所在页面":"主界面"}' },
      ['EN（英文）'],
      {}
    );

    expect(resolved.isComplete).toBe(true);
    expect(resolved.tmTranslations).toEqual({ 'EN（英文）': 'Cadence Sensor' });
    expect(resolved.missingFromGlossary).toEqual([]);
  });

  it('injects partial glossary translations alongside existing_translations into Dify context', () => {
    const terms = buildMatchedGlossaryTerms(
      [legacyGlossaryClose],
      '关闭',
      legacyGlossaryClose,
      { 'EN（英文）': 'off' },
      { 'EN（英文）': 'close', 'FR（法）': 'fermer' }
    );

    expect(terms).toHaveLength(2);
    expect(terms[0]['各语种强制翻译']).toEqual({ 'EN（英文）': 'off' });
    expect(terms[1]['各语种强制翻译']).toEqual({ 'EN（英文）': 'close', 'FR（法）': 'fermer' });
  });

  it('parses flat Thai/TH/Swedish outputs without failing wrapper checks', () => {
    expect(isKnownLanguageKey('text', ['泰语'])).toBe(false);
    expect(isKnownLanguageKey('泰语', ['泰语'])).toBe(true);
    expect(isKnownLanguageKey('TH', ['泰语'])).toBe(true);

    const flatThai = parseDifyWorkflowOutputs({ data: { outputs: { 泰语: 'ปิด' } } }, ['泰语']);
    expect(flatThai).toEqual({ ok: true, resultObj: { 泰语: 'ปิด' } });

    const wrappedThai = parseDifyWorkflowOutputs(
      { data: { outputs: { text: '```json\n{"TH": "ปิด"}\n```' } } },
      ['泰语']
    );
    expect(wrappedThai).toEqual({ ok: true, resultObj: { TH: 'ปิด' } });
  });

  it('returns HTTP 500 error (never 200) when Dify code node returns an error object without fallback JSON', () => {
    const parsed = parseDifyWorkflowOutputs(
      { data: { outputs: { result: JSON.stringify({ error: 'LLM quota exceeded' }) } } },
      ['泰语']
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(500);
    expect(parsed.error).toContain('LLM quota exceeded');
  });
});
