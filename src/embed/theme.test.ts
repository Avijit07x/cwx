import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, contrastWithWhite, isReadableAccent } from './theme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

function rootStyle(property: string): string {
  return document.documentElement.style.getPropertyValue(property);
}

describe('contrastWithWhite', () => {
  it('matches the WCAG contrast ratio for reference colours', () => {
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 5);
    expect(contrastWithWhite('#767676')).toBeCloseTo(4.54, 2);
  });

  it('accepts accents that keep white button text readable and rejects light ones', () => {
    expect(isReadableAccent('#2357d9')).toBe(true);
    expect(isReadableAccent('#0B6AA2')).toBe(true);
    expect(isReadableAccent('#ffd500')).toBe(false);
    expect(isReadableAccent('#7fb2e5')).toBe(false);
  });
});

describe('applyTheme', () => {
  it('derives the accent family, font stack and radius scale as CSS variables', () => {
    applyTheme({ accent: '#0b6aa2', fontFamily: 'Segoe UI', radius: 10 });

    expect(rootStyle('--color-accent')).toBe('#0b6aa2');
    expect(rootStyle('--color-accent-active')).toBe('color-mix(in srgb, #0b6aa2 72%, black)');
    expect(rootStyle('--color-accent-subtle')).toBe('color-mix(in srgb, #0b6aa2 9%, white)');
    expect(rootStyle('--color-focus')).toBe('#0b6aa2');
    expect(rootStyle('--font-sans')).toBe("'Segoe UI', system-ui, sans-serif");
    expect([rootStyle('--radius-sm'), rootStyle('--radius-md')]).toEqual(['6px', '10px']);
  });

  it('removes overrides that a later theme leaves out', () => {
    applyTheme({ accent: '#0b6aa2', fontFamily: 'Roboto', radius: 4 });
    applyTheme({ fontFamily: 'Roboto' });

    expect(rootStyle('--color-accent')).toBe('');
    expect(rootStyle('--radius-md')).toBe('');
    expect(rootStyle('--font-sans')).toBe('Roboto, system-ui, sans-serif');
  });

  it('leaves unrelated inline styles alone', () => {
    document.documentElement.style.setProperty('--viewport-extra', '1');
    applyTheme({ radius: 3 });
    applyTheme({});

    expect(rootStyle('--viewport-extra')).toBe('1');
    expect(rootStyle('--radius-md')).toBe('');
  });
});
