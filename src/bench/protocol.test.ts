import { describe, expect, it } from 'vitest';
import {
  mean,
  median,
  percentile,
  runBenchmark,
  type BenchDriver,
  type BenchTimings,
  type Progress,
} from './protocol';

const TIMINGS: BenchTimings = { loadRuns: 5, warmupMs: 1000, measureMs: 5000 };

interface FakeDriverOptions {
  readonly loadMs?: readonly number[];
  readonly frameMs?: (frame: number) => number;
  readonly renderMs?: number;
  readonly syncMs?: number;
  readonly onLoad?: (run: number) => void;
}

function fakeDriver({
  loadMs = [100, 60, 50, 70, 80],
  frameMs = () => 10,
  renderMs = 2,
  syncMs = 3,
  onLoad,
}: FakeDriverOptions = {}) {
  let clock = 0;
  let frames = 0;
  let loads = 0;
  const log: string[] = [];
  const driver: BenchDriver<string> = {
    now: () => clock,
    nextFrame: () => {
      clock += frameMs(frames);
      frames += 1;
      return Promise.resolve();
    },
    load: () => {
      clock += loadMs[loads] ?? 0;
      loads += 1;
      onLoad?.(loads);
      log.push(`load ${loads}`);
      return Promise.resolve({ content: `model ${loads}`, bytes: 1234 });
    },
    show: (content) => {
      log.push(`show ${content}`);
    },
    clear: () => {
      log.push('clear');
    },
    render: () => {
      clock += renderMs;
      return { cpuMs: renderMs, drawCalls: 8, triangles: 63_291 };
    },
    syncGpu: () => {
      clock += syncMs;
    },
  };
  return { driver, log };
}

describe('statistics', () => {
  it('computes mean, median and nearest-rank percentiles', () => {
    expect(mean([2, 4, 9])).toBe(5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([10, 20], 95)).toBe(20);
    expect(percentile([7], 50)).toBe(7);
  });

  it('returns zero for empty input', () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('runBenchmark', () => {
  it('times each cold load from fetch start to the GPU-synchronised first frame', async () => {
    const { driver, log } = fakeDriver();

    const result = await runBenchmark(
      driver,
      TIMINGS,
      () => undefined,
      new AbortController().signal,
    );

    expect(result.loadMs).toEqual([105, 65, 55, 75, 85]);
    expect(result.loadMedianMs).toBe(75);
    expect(result.bytes).toBe(1234);
    expect(log.slice(0, 6)).toEqual([
      'clear',
      'load 1',
      'show model 1',
      'clear',
      'load 2',
      'show model 2',
    ]);
    expect(log.filter((entry) => entry === 'clear')).toHaveLength(5);
  });

  it('ends every frame with a GPU sync, so frame time includes GPU work and CPU time does not', async () => {
    const { driver } = fakeDriver({ frameMs: () => 10, renderMs: 2, syncMs: 30 });

    const result = await runBenchmark(
      driver,
      TIMINGS,
      () => undefined,
      new AbortController().signal,
    );

    expect(result.frameAvgMs).toBe(42);
    expect(result.frameP95Ms).toBe(42);
    expect(result.cpuAvgMs).toBe(2);
  });

  it('measures frame intervals only after the warm-up and over the measurement window', async () => {
    const { driver } = fakeDriver({
      frameMs: (frame) => (frame % 10 === 9 ? 40 : 10),
      syncMs: 0,
    });

    const result = await runBenchmark(
      driver,
      TIMINGS,
      () => undefined,
      new AbortController().signal,
    );

    expect(result.frames).toBeGreaterThan(300);
    expect(result.frames).toBeLessThan(450);
    expect(result.frameAvgMs).toBeCloseTo((9 * 12 + 42) / 10, 0);
    expect(result.frameP95Ms).toBe(42);
    expect(result.cpuAvgMs).toBe(2);
    expect(result.drawCalls).toBe(8);
    expect(result.triangles).toBe(63_291);
  });

  it('reports progress for every load run, then the warm-up and the measurement', async () => {
    const { driver } = fakeDriver();
    const progress: Progress[] = [];

    await runBenchmark(
      driver,
      TIMINGS,
      (step) => progress.push(step),
      new AbortController().signal,
    );

    expect(progress).toEqual([
      { phase: 'load', run: 1, total: 5 },
      { phase: 'load', run: 2, total: 5 },
      { phase: 'load', run: 3, total: 5 },
      { phase: 'load', run: 4, total: 5 },
      { phase: 'load', run: 5, total: 5 },
      { phase: 'warmup' },
      { phase: 'measure' },
    ]);
  });

  it('stops after an abort and still hands the loaded model to the driver for disposal', async () => {
    const controller = new AbortController();
    const { driver, log } = fakeDriver({
      onLoad: (run) => {
        if (run === 2) controller.abort();
      },
    });

    await expect(
      runBenchmark(driver, TIMINGS, () => undefined, controller.signal),
    ).rejects.toThrow();

    expect(log).toEqual(['clear', 'load 1', 'show model 1', 'clear', 'load 2', 'show model 2']);
  });
});
