import { describe, expect, test } from 'vitest';
import { defineMessages } from './define';
import { createTranslate } from './engine';
import { LOCALES } from './locales';
import { messages } from './messages';

const translate = createTranslate(messages);

describe('createTranslate', () => {
  test('fills placeholders, and leaves ones without a value visible', () => {
    expect(translate('en', 'rule.clearance', { a: 'CAB-01' })).toBe(
      'CAB-01 and {b} are {gap} apart (minimum {min}).',
    );
  });

  test('renders every message in both languages with all placeholders filled, unescaped', () => {
    for (const locale of LOCALES) {
      for (const [key, template] of Object.entries(messages[locale])) {
        const names = (template.match(/\{\w+\}/g) ?? []).map((match) => match.slice(1, -1));
        const params = Object.fromEntries(names.map((name) => [name, `<${name}>`]));
        expect(translate(locale, key, params)).toBe(template.replace(/\{(\w+)\}/g, '<$1>'));
      }
    }
  });

  test('treats every param as a placeholder value, never as an i18next option', () => {
    expect(
      translate('en', 'history.move', {
        subject: 'CAB-01',
        lng: 'vi',
        ns: 'other',
        count: 2,
        defaultValue: 'x',
      }),
    ).toBe('Move CAB-01');
  });

  test('serves any message module with the same rules, such as the bench page’s', () => {
    const page = createTranslate(
      defineMessages(
        { 'page.runs.one': '{count} run of {model}', 'page.runs.other': '{count} runs of {model}' },
        {
          'page.runs.one': '{count} lần chạy {model}',
          'page.runs.other': '{count} lần chạy {model}',
        },
      ),
    );
    expect(page('en', 'page.runs', { count: '1', model: 'LOD1' }, 1)).toBe('1 run of LOD1');
    expect(page('en', 'page.runs', { count: '5', model: 'LOD1' }, 5)).toBe('5 runs of LOD1');
    expect(page('vi', 'page.runs', { count: '5', model: 'LOD1' }, 5)).toBe('5 lần chạy LOD1');
  });
});
