export interface FrameSample {
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface LoadedContent<Content> {
  readonly content: Content;
  readonly bytes: number;
}

export interface BenchDriver<Content> {
  readonly now: () => number;
  readonly nextFrame: () => Promise<void>;
  readonly load: (signal: AbortSignal) => Promise<LoadedContent<Content>>;
  readonly show: (content: Content) => void;
  readonly clear: () => void;
  readonly render: () => FrameSample;
  readonly syncGpu: () => void;
}

export interface BenchTimings {
  readonly loadRuns: number;
  readonly warmupMs: number;
  readonly measureMs: number;
}

export const BENCH_TIMINGS: BenchTimings = { loadRuns: 5, warmupMs: 1000, measureMs: 5000 };

export type Progress =
  | { readonly phase: 'load'; readonly run: number; readonly total: number }
  | { readonly phase: 'warmup' }
  | { readonly phase: 'measure' };

export interface BenchResult {
  readonly bytes: number;
  readonly loadMs: readonly number[];
  readonly loadMedianMs: number;
  readonly frameAvgMs: number;
  readonly frameP95Ms: number;
  readonly cpuAvgMs: number;
  readonly frames: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function percentile(values: readonly number[], rank: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export async function runBenchmark<Content>(
  driver: BenchDriver<Content>,
  timings: BenchTimings,
  onProgress: (progress: Progress) => void,
  signal: AbortSignal,
): Promise<BenchResult> {
  const loadMs: number[] = [];
  let bytes = 0;
  for (let run = 1; run <= timings.loadRuns; run++) {
    onProgress({ phase: 'load', run, total: timings.loadRuns });
    driver.clear();
    await driver.nextFrame();
    signal.throwIfAborted();
    const started = driver.now();
    const loaded = await driver.load(signal);
    driver.show(loaded.content);
    signal.throwIfAborted();
    driver.render();
    driver.syncGpu();
    loadMs.push(driver.now() - started);
    bytes = loaded.bytes;
  }

  const frame = async () => {
    await driver.nextFrame();
    signal.throwIfAborted();
    const time = driver.now();
    const sample = driver.render();
    driver.syncGpu();
    return { time, sample };
  };

  onProgress({ phase: 'warmup' });
  let last = await frame();
  const warmupEnd = last.time + timings.warmupMs;
  while (last.time < warmupEnd) last = await frame();

  onProgress({ phase: 'measure' });
  const intervals: number[] = [];
  const cpuMs: number[] = [];
  const measureEnd = last.time + timings.measureMs;
  while (last.time < measureEnd) {
    const next = await frame();
    intervals.push(next.time - last.time);
    cpuMs.push(next.sample.cpuMs);
    last = next;
  }

  return {
    bytes,
    loadMs,
    loadMedianMs: median(loadMs),
    frameAvgMs: mean(intervals),
    frameP95Ms: percentile(intervals, 95),
    cpuAvgMs: mean(cpuMs),
    frames: intervals.length,
    drawCalls: last.sample.drawCalls,
    triangles: last.sample.triangles,
  };
}
