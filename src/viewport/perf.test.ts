import { afterEach, describe, expect, it } from 'vitest';
import {
  adaptivePixelRatio,
  createFrameMeter,
  frameStats,
  PIXEL_RATIO,
  readGpuName,
  readHeapBytes,
} from './perf';

describe('frameStats', () => {
  it('reports frame rate, average frame time and the 95th percentile', () => {
    const intervals = [...Array.from({ length: 18 }, () => 16), 40, 40];
    const stats = frameStats(intervals);
    expect(stats?.avgMs).toBeCloseTo(18.4);
    expect(stats?.fps).toBeCloseTo(1000 / 18.4);
    expect(stats?.p95Ms).toBe(40);
  });

  it('ignores a single slow frame in the 95th percentile of a steady second', () => {
    const intervals = [...Array.from({ length: 59 }, () => 16.7), 50];
    expect(frameStats(intervals)?.p95Ms).toBe(16.7);
  });

  it('has nothing to report before two frames arrive', () => {
    expect(frameStats([])).toBeNull();
  });
});

describe('createFrameMeter', () => {
  it('measures intervals over the last second only', () => {
    const meter = createFrameMeter();
    for (const time of [0, 500, 1000, 1500, 2000]) meter.record(time);
    expect(meter.intervals(2000)).toEqual([500, 500]);
  });

  it('keeps working after its buffer wraps around', () => {
    const meter = createFrameMeter(4);
    for (const time of [0, 10, 20, 30, 40, 50]) meter.record(time);
    expect(meter.intervals(50)).toEqual([10, 10, 10]);
  });
});

describe('readHeapBytes', () => {
  afterEach(() => {
    Reflect.deleteProperty(performance, 'memory');
  });

  it('is unavailable when the browser hides heap size', () => {
    expect(readHeapBytes()).toBeNull();
  });

  it('reads the used JS heap where the browser exposes it', () => {
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: { usedJSHeapSize: 52_428_800 },
    });
    expect(readHeapBytes()).toBe(52_428_800);
  });
});

describe('readGpuName', () => {
  const RENDERER = 7937;
  const UNMASKED = 37446;
  const parameters = new Map<number, string>([
    [RENDERER, 'WebKit WebGL'],
    [UNMASKED, 'ANGLE (Intel, Intel(R) UHD Graphics 620)'],
  ]);

  it('prefers the unmasked renderer string', () => {
    const context = {
      RENDERER,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: UNMASKED }),
      getParameter: (name: number) => parameters.get(name),
    };
    expect(readGpuName(context)).toBe('ANGLE (Intel, Intel(R) UHD Graphics 620)');
  });

  it('falls back to the plain renderer string', () => {
    const context = {
      RENDERER,
      getExtension: () => null,
      getParameter: (name: number) => parameters.get(name),
    };
    expect(readGpuName(context)).toBe('WebKit WebGL');
  });
});

describe('adaptivePixelRatio', () => {
  it('keeps the full device-following range while the frame rate holds', () => {
    expect(adaptivePixelRatio(1, 2)).toBe(PIXEL_RATIO);
  });

  it('lowers the resolution step by step down to half, capped by the display', () => {
    expect(adaptivePixelRatio(0.5, 2)).toBeCloseTo(1.125);
    expect(adaptivePixelRatio(0, 2)).toBeCloseTo(0.75);
    expect(adaptivePixelRatio(0, 1)).toBeCloseTo(0.5);
    expect(adaptivePixelRatio(0.9, 1)).toBeLessThan(1);
  });
});
