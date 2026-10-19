import { describe, expect, it } from 'vitest';
import { configSearch, DEFAULT_CONFIG, parseBenchConfig } from './config';

describe('parseBenchConfig', () => {
  it('defaults to one instanced copy of the optimised model in English', () => {
    expect(parseBenchConfig('')).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({ model: 'opt', copies: 1, instancing: true, locale: 'en' });
  });

  it('reads model, copies, instancing and language from the query string', () => {
    expect(parseBenchConfig('?model=raw&copies=100&instancing=off&lang=vi')).toEqual({
      model: 'raw',
      copies: 100,
      instancing: false,
      locale: 'vi',
    });
    expect(parseBenchConfig('?model=lod2').model).toBe('lod2');
  });

  it('falls back to defaults for values outside the supported set', () => {
    expect(parseBenchConfig('?model=huge&copies=7&instancing=maybe&lang=fr')).toEqual({
      ...DEFAULT_CONFIG,
      instancing: true,
    });
    expect(parseBenchConfig('?copies=abc').copies).toBe(1);
  });
});

describe('configSearch', () => {
  it('round-trips every configuration through the query string', () => {
    const configs = [
      DEFAULT_CONFIG,
      { model: 'raw', copies: 100, instancing: false, locale: 'vi' },
      { model: 'lod1', copies: 1, instancing: false, locale: 'en' },
    ] as const;
    for (const config of configs) expect(parseBenchConfig(configSearch(config))).toEqual(config);
  });

  it('omits the language parameter for English', () => {
    expect(configSearch(DEFAULT_CONFIG)).toBe('?model=opt&copies=1&instancing=on');
  });
});
