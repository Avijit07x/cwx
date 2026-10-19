import { describe, expect, test } from 'vitest';
import {
  foldText,
  formatCountdown,
  formatMegabytes,
  formatMilliseconds,
  formatRatio,
} from './format';

describe('formatCountdown', () => {
  test.each([
    [120_000, '2:00'],
    [61_000, '1:01'],
    [59_001, '1:00'],
    [600_000, '10:00'],
    [1, '0:01'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('shows %i ms as %s, rounding up to whole seconds', (remainingMs, text) => {
    expect(formatCountdown(remainingMs)).toBe(text);
  });
});

describe('measurement formats', () => {
  test('follow the language, with megabytes of 1,000,000 bytes', () => {
    expect(formatMilliseconds('en', 8.34)).toBe('8.3 ms');
    expect(formatMilliseconds('vi', 8.34)).toBe('8,3 mili giây');
    expect(formatMilliseconds('en', 9.1, 2)).toBe('9.10 ms');
    expect(formatMegabytes('en', 100_000_000)).toBe('100.0 MB');
    expect(formatMegabytes('vi', 1_500_000)).toBe('1,5 MB');
    expect(formatMegabytes('en', 5_566_536, 2)).toBe('5.57 MB');
    expect(formatRatio('vi', 1.5)).toBe('1,5');
  });
});

describe('foldText', () => {
  test('ignores case, accents and the Vietnamese đ, so searches match either spelling', () => {
    expect(foldText('Tủ Điện')).toBe('tu dien');
    expect(foldText('Biến tần')).toBe('bien tan');
    expect(foldText('CAB-01')).toBe('cab-01');
  });
});
