import { describe, expect, it } from 'vitest';
import { isAtLeast, parseVersion } from './toolchain.ts';

describe('KTX-Software version gate', () => {
  it('reads the version from ktx --version output', () => {
    expect(parseVersion('ktx version: v4.4.2')).toEqual([4, 4, 2]);
    expect(parseVersion('ktx version: v4.3.0~5\n')).toEqual([4, 3, 0]);
    expect(parseVersion('command not found')).toBeNull();
  });

  it('accepts 4.4.0 and later, rejects older releases', () => {
    const minimum = [4, 4, 0];
    expect(isAtLeast([4, 4, 0], minimum)).toBe(true);
    expect(isAtLeast([4, 4, 2], minimum)).toBe(true);
    expect(isAtLeast([5, 0, 0], minimum)).toBe(true);
    expect(isAtLeast([4, 3, 9], minimum)).toBe(false);
    expect(isAtLeast([3, 9, 9], minimum)).toBe(false);
  });
});
