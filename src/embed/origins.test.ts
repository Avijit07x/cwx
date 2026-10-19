import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST_ORIGINS, parseHostOrigins, resolveHostOrigins } from './origins';

describe('parseHostOrigins', () => {
  it('keeps http(s) origins, normalises and de-duplicates them, and drops everything else', () => {
    expect(
      parseHostOrigins(
        ' http://127.0.0.1:5173/ ,https://host.example/app?x=1, *, javascript:alert(1), ftp://files.example, not a url, http://127.0.0.1:5173',
      ),
    ).toEqual(['http://127.0.0.1:5173', 'https://host.example']);
    expect(parseHostOrigins('')).toEqual([]);
  });
});

describe('resolveHostOrigins', () => {
  it('allows the local demo hosts when nothing is configured', () => {
    expect(resolveHostOrigins(undefined)).toEqual([
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4173',
    ]);
    expect(resolveHostOrigins('')).toBe(DEFAULT_HOST_ORIGINS);
    expect(resolveHostOrigins('  ')).toBe(DEFAULT_HOST_ORIGINS);
  });

  it('allows only the configured origins once a list is set', () => {
    expect(resolveHostOrigins('https://portal.example/, https://staging.example:8443')).toEqual([
      'https://portal.example',
      'https://staging.example:8443',
    ]);
  });

  it('drops junk entries and stays closed rather than falling back when nothing valid is left', () => {
    expect(resolveHostOrigins('*, javascript:alert(1), https://portal.example')).toEqual([
      'https://portal.example',
    ]);
    expect(resolveHostOrigins("*, 'self', javascript:alert(1), not a url")).toEqual([]);
  });
});
