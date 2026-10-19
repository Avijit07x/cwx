import { describe, expect, test, vi } from 'vitest';
import { memoizeLast } from './memo';

describe('memoizeLast', () => {
  test('returns the cached result while the arguments are the same objects', () => {
    const compute = vi.fn((items: readonly number[], factor: number) =>
      items.map((n) => n * factor),
    );
    const memoised = memoizeLast(compute);
    const items = [1, 2, 3];
    const first = memoised(items, 2);
    expect(memoised(items, 2)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  test('recomputes when any argument changes, even to an equal copy', () => {
    const compute = vi.fn((items: readonly number[], factor: number) =>
      items.map((n) => n * factor),
    );
    const memoised = memoizeLast(compute);
    const items = [1, 2, 3];
    memoised(items, 2);
    memoised(items, 3);
    memoised([1, 2, 3], 3);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  test('remembers only the last call', () => {
    const compute = vi.fn((value: string) => ({ value }));
    const memoised = memoizeLast(compute);
    const a = memoised('a');
    memoised('b');
    expect(memoised('a')).not.toBe(a);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  test('compares with Object.is, so NaN hits the cache and -0 does not match 0', () => {
    const compute = vi.fn((value: number) => ({ value }));
    const memoised = memoizeLast(compute);
    memoised(Number.NaN);
    memoised(Number.NaN);
    memoised(0);
    memoised(-0);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  test('keeps the previous result when a new one is the same by the given comparison', () => {
    const evens = memoizeLast(
      (items: readonly number[]) => items.filter((n) => n % 2 === 0),
      (previous, next) => previous.join() === next.join(),
    );
    const first = evens([1, 2, 3, 4]);
    expect(evens([2, 4, 5])).toBe(first);
    expect(evens([2, 6])).toEqual([2, 6]);
    expect(evens([2, 6])).not.toBe(first);
  });
});
