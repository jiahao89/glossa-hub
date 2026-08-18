import { describe, it, expect } from 'vitest';
import { findTranslationForLang } from '../languageHelper';

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
});
