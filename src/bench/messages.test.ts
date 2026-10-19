import { describe, expect, it } from 'vitest';
import { benchMessages, benchTranslator } from './messages';

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('benchMessages', () => {
  it('translates every key into Vietnamese with the same placeholders', () => {
    const vietnamese = new Map(Object.entries(benchMessages.vi));
    const english = Object.entries(benchMessages.en);
    expect(vietnamese.size).toBe(english.length);
    for (const [key, text] of english) {
      expect(key.startsWith('bench.')).toBe(true);
      const translated = vietnamese.get(key);
      expect(translated, key).toBeTruthy();
      expect(placeholders(translated ?? ''), key).toEqual(placeholders(text));
    }
  });
});

describe('benchTranslator', () => {
  it('fills placeholders in the chosen language', () => {
    expect(benchTranslator('en')('bench.status.load', { run: 2, total: 5 })).toBe(
      'Load run 2 of 5',
    );
    expect(benchTranslator('vi')('bench.status.load', { run: 2, total: 5 })).toBe('Lần tải 2/5');
  });

  it('leaves placeholders without a value in place', () => {
    expect(benchTranslator('en')('bench.missing.lod')).toContain('{command}');
  });
});
