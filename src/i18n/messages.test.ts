import { describe, expect, test } from 'vitest';
import { commonMessages } from './common';
import type { MessageModule } from './define';
import { MESSAGE_MODULES, messages } from './messages';

const MODULES: readonly MessageModule[] = MESSAGE_MODULES;

const KEY_CAP_LABELS = new Set([
  'enter',
  'shift',
  'esc',
  'escape',
  'tab',
  'ctrl',
  'alt',
  'option',
  'delete',
  'backspace',
  'space',
  'home',
  'end',
]);

function isLanguageNeutral(text: string): boolean {
  const words = text.replace(/\{\w+\}|\b(?:fps|ms|px)\b/g, '');
  return KEY_CAP_LABELS.has(words.trim().toLowerCase()) || !/[a-z]{3,}/.test(words);
}

function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort((a, b) => a.localeCompare(b));
}

function entries(module: MessageModule): [string, string, string | undefined][] {
  return Object.entries(module.en).map(([key, en]) => [key, en, module.vi[key]]);
}

const ALL_ENTRIES = MODULES.flatMap(entries);

describe('message dictionaries', () => {
  test('no string is empty', () => {
    const empty = ALL_ENTRIES.filter(
      ([, en, vi]) => en.trim() === '' || (vi ?? '').trim() === '',
    ).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  test('English and Vietnamese use exactly the same placeholders', () => {
    const different = ALL_ENTRIES.filter(
      ([, en, vi]) => placeholders(en).join() !== placeholders(vi ?? '').join(),
    ).map(
      ([key, en, vi]) => `${key}: ${placeholders(en).join()} vs ${placeholders(vi ?? '').join()}`,
    );
    expect(different).toEqual([]);
  });

  test('placeholders are well formed (no stray braces)', () => {
    const malformed = ALL_ENTRIES.filter(([, en, vi]) =>
      [en, vi ?? ''].some((text) => /[{}]/.test(text.replace(/\{\w+\}/g, ''))),
    ).map(([key]) => key);
    expect(malformed).toEqual([]);
  });

  test('no key is defined by more than one module', () => {
    const counts = new Map<string, number>();
    for (const module of MODULES) {
      for (const key of Object.keys(module.en)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect([...counts].filter(([, count]) => count > 1).map(([key]) => key)).toEqual([]);
    expect(Object.keys(messages.en)).toHaveLength(counts.size);
    expect(new Set(Object.keys(messages.vi))).toEqual(new Set(Object.keys(messages.en)));
  });

  test('the merged dictionaries hold the text of every module in both languages', () => {
    const differing = MODULES.flatMap((module) =>
      Object.keys(module.en).filter(
        (key) => messages.en[key] !== module.en[key] || messages.vi[key] !== module.vi[key],
      ),
    );
    expect(differing).toEqual([]);
  });

  test('every module keeps its keys under prefixes of its own, one per feature module', () => {
    const prefixes = MODULES.map((module) => [
      ...new Set(Object.keys(module.en).map((key) => key.slice(0, key.indexOf('.')))),
    ]);
    const all = prefixes.flat();
    expect(all.filter((prefix, index) => all.indexOf(prefix) !== index)).toEqual([]);
    expect(
      prefixes.filter((own, index) => MODULES[index] !== commonMessages && own.length !== 1),
    ).toEqual([]);
  });

  test('plural keys come in one/other pairs', () => {
    const keys = new Set(Object.keys(messages.en));
    const unpaired = [...keys].filter(
      (key) =>
        (key.endsWith('.one') && !keys.has(`${key.slice(0, -'.one'.length)}.other`)) ||
        (key.endsWith('.other') && !keys.has(`${key.slice(0, -'.other'.length)}.one`)),
    );
    expect(unpaired).toEqual([]);
  });

  test('Vietnamese strings are translated, not copied from English', () => {
    const untranslated = ALL_ENTRIES.filter(
      ([, en, vi]) => vi === en && !isLanguageNeutral(en),
    ).map(([key, en]) => `${key}: ${en}`);
    expect(untranslated).toEqual([]);
  });
});
