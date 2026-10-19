import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, expectTypeOf, test } from 'vitest';
import { setLocale } from '../state/actions';
import { resetEditor } from '../state/store';
import { INTL_LOCALE, isLocale, LOCALES, type Locale } from './locales';
import { getTranslator } from './translate';
import { useT } from './useT';

describe('t', () => {
  const en = getTranslator('en');

  test('returns the template for the language when there are no params', () => {
    expect(en.t('history.clear')).toBe('Clear layout');
    expect(getTranslator('vi').t('history.clear')).toBe('Xóa toàn bộ bố trí');
  });

  test('fills every placeholder', () => {
    expect(en.t('rule.clearance', { a: 'CAB-01', b: 'VFD-02', gap: '0.50 m', min: '0.60 m' })).toBe(
      'CAB-01 and VFD-02 are 0.50 m apart (minimum 0.60 m).',
    );
    expect(en.t('error.tag-too-long', { max: 24 })).toBe('Use at most 24 characters.');
  });

  test('inserts parameter values literally', () => {
    expect(en.t('history.move', { subject: '$& {subject} $1' })).toBe('Move $& {subject} $1');
  });

  test('inserts falsy values such as 0 and the empty string', () => {
    expect(en.t('error.tag-too-long', { max: 0 })).toBe('Use at most 0 characters.');
    expect(en.t('history.move', { subject: '' })).toBe('Move ');
  });

  test('takes exactly the parameters that the English template names', () => {
    expectTypeOf<Parameters<typeof en.t<'announce.moved'>>>().toEqualTypeOf<
      [key: 'announce.moved', params: Readonly<Record<'tag' | 'x' | 'z', string | number>>]
    >();
    expectTypeOf<Parameters<typeof en.t<'history.clear'>>>().toEqualTypeOf<
      [key: 'history.clear']
    >();
    expectTypeOf<Parameters<typeof en.t<'announce.undone' | 'announce.redone'>>>().toEqualTypeOf<
      [
        key: 'announce.undone' | 'announce.redone',
        params: Readonly<Record<'action', string | number>>,
      ]
    >();
    expectTypeOf<Parameters<typeof en.plural<'assistant.reply.fixSome'>>>().toEqualTypeOf<
      [
        key: 'assistant.reply.fixSome',
        count: number,
        params: Readonly<Record<'after', string | number>>,
      ]
    >();
    expectTypeOf<Parameters<typeof en.plural<'history.assistant'>>>().toEqualTypeOf<
      [key: 'history.assistant', count: number]
    >();
  });
});

describe('getTranslator', () => {
  const en = getTranslator('en');
  const vi = getTranslator('vi');

  test('returns one cached translator per language', () => {
    expect(getTranslator('vi')).toBe(vi);
    expect(en.locale).toBe('en');
    expect(vi.locale).toBe('vi');
    expect(vi.t('app.name')).toBe('Trình bố trí thiết bị');
  });

  test('plural picks the form by each language’s rules and formats the count', () => {
    expect(en.plural('history.assistant', 1)).toBe('Assistant change (1 move)');
    expect(en.plural('history.assistant', 0)).toBe('Assistant change (0 moves)');
    expect(en.plural('history.assistant', 1234)).toBe('Assistant change (1,234 moves)');
    expect(vi.plural('history.assistant', 1)).toBe('Thay đổi của trợ lý (1 lần di chuyển)');
    expect(vi.plural('history.assistant', 1234)).toBe('Thay đổi của trợ lý (1.234 lần di chuyển)');
  });

  test.each<[Locale, string, string, string, string, string, string]>([
    ['en', '3.50 m', '1,234.50 m', '$4,800.00', '1,234,567', '90°', 'CAB-01, VFD-02, and UPS-01'],
    ['vi', '3,50 m', '1.234,50 m', '4.800,00 US$', '1.234.567', '90°', 'CAB-01, VFD-02 và UPS-01'],
  ])(
    'formats metres, money, integers, degrees and lists for %s',
    (locale, metres, bigMetres, usd, integer, degrees, list) => {
      const t = getTranslator(locale);
      expect(t.metres(3.5)).toBe(metres);
      expect(t.metres(1234.5)).toBe(bigMetres);
      expect(t.usd(4800)).toBe(usd);
      expect(t.integer(1234567)).toBe(integer);
      expect(t.degrees(90)).toBe(degrees);
      expect(t.list(['CAB-01', 'VFD-02', 'UPS-01'])).toBe(list);
    },
  );

  test.each<[Locale, string, string, string, string]>([
    ['en', '3.50', '1,234.50', '0.6', '2'],
    ['vi', '3,50', '1.234,50', '0,6', '2'],
  ])(
    'decimal formats plain numbers with a fixed number of digits for %s',
    (locale, twoDigits, big, oneDigit, whole) => {
      const t = getTranslator(locale);
      expect(t.decimal(3.5)).toBe(twoDigits);
      expect(t.decimal(1234.5)).toBe(big);
      expect(t.decimal(0.6, 1)).toBe(oneDigit);
      expect(t.decimal(2, 0)).toBe(whole);
    },
  );

  test('metres always show two decimals and integers round', () => {
    expect(en.metres(0.6)).toBe('0.60 m');
    expect(en.metres(12)).toBe('12.00 m');
    expect(vi.metres(0.6)).toBe('0,60 m');
    expect(en.integer(2.6)).toBe('3');
  });

  test('names item types in both languages', () => {
    expect(en.kindName('drive')).toBe('Variable frequency drive');
    expect(vi.kindName('drive')).toBe('Biến tần');
    expect(en.kindShort('transformer')).toBe('Transformer');
    expect(vi.kindShort('transformer')).toBe('Máy biến áp');
  });
});

describe('locales', () => {
  test('English and Vietnamese are supported, each with its Intl locale', () => {
    expect(LOCALES).toEqual(['en', 'vi']);
    expect(INTL_LOCALE).toEqual({ en: 'en-US', vi: 'vi-VN' });
    expect(LOCALES.every((locale) => isLocale(locale))).toBe(true);
    expect(['fr', 'EN', 'vi-VN', '', null].some((value) => isLocale(value))).toBe(false);
  });
});

describe('useT', () => {
  beforeEach(() => {
    resetEditor();
    window.localStorage.clear();
  });

  test('follows the editor language', () => {
    const { result } = renderHook(() => useT());
    expect(result.current).toBe(getTranslator('en'));
    act(() => {
      setLocale('vi');
    });
    expect(result.current).toBe(getTranslator('vi'));
  });
});
