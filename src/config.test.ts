import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from './config';

describe('parseLaunchOptions', () => {
  it('opens the saved layout with instancing on when the URL has no options', () => {
    expect(parseLaunchOptions('')).toEqual({
      seed: null,
      perf: false,
      instancing: true,
      embed: false,
    });
  });

  it('reads every documented option', () => {
    expect(parseLaunchOptions('?seed=500&perf=1&instancing=off&embed=1')).toEqual({
      seed: 500,
      perf: true,
      instancing: false,
      embed: true,
    });
  });

  it('caps a generated layout at 2,000 items and ignores seeds that are not whole numbers', () => {
    for (const seed of ['9999', '10000', '99999999999999999999']) {
      expect(parseLaunchOptions(`?seed=${seed}`).seed).toBe(2000);
    }
    for (const seed of ['', '-5', '1.5', 'abc']) {
      expect(parseLaunchOptions(`?seed=${seed}`).seed).toBeNull();
    }
  });
});
