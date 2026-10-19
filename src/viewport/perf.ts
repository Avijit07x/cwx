import type { Dpr } from '@react-three/fiber';
import { create } from 'zustand';

export interface FrameStats {
  readonly fps: number;
  readonly avgMs: number;
  readonly p95Ms: number;
}

export interface PerfSample {
  readonly frames: FrameStats | null;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly heapBytes: number | null;
  readonly gpu: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export const PERF_PUBLISH_INTERVAL_MS = 500;
const PERF_WINDOW_MS = 1000;
export const PIXEL_RATIO: [min: number, max: number] = [1, 1.5];
const MIN_RESOLUTION_SCALE = 0.5;

export const usePerf = create<{ readonly sample: PerfSample | null }>()(() => ({ sample: null }));

export function publishPerf(sample: PerfSample | null): void {
  usePerf.setState({ sample });
}

export function frameStats(intervals: readonly number[]): FrameStats | null {
  if (intervals.length === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const avgMs = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? avgMs;
  return { fps: 1000 / avgMs, avgMs, p95Ms };
}

export function adaptivePixelRatio(factor: number, devicePixelRatio: number): Dpr {
  if (factor >= 1) return PIXEL_RATIO;
  const [low, high] = PIXEL_RATIO;
  const full = Math.min(Math.max(devicePixelRatio, low), high);
  const scale = MIN_RESOLUTION_SCALE + (1 - MIN_RESOLUTION_SCALE) * Math.max(0, factor);
  return full * scale;
}

interface FrameMeter {
  record(now: number): void;
  intervals(now: number, windowMs?: number): number[];
}

export function createFrameMeter(capacity = 512): FrameMeter {
  const times = new Float64Array(capacity);
  let next = 0;
  let size = 0;
  return {
    record(now) {
      times[next] = now;
      next = (next + 1) % capacity;
      size = Math.min(size + 1, capacity);
    },
    intervals(now, windowMs = PERF_WINDOW_MS) {
      const result: number[] = [];
      let previous: number | null = null;
      for (let step = 0; step < size; step++) {
        const time = times[(next - size + step + capacity) % capacity] ?? 0;
        if (time < now - windowMs) continue;
        if (previous !== null) result.push(time - previous);
        previous = time;
      }
      return result;
    },
  };
}

export function readHeapBytes(): number | null {
  if (!('memory' in performance)) return null;
  const { memory } = performance;
  if (typeof memory !== 'object' || memory === null || !('usedJSHeapSize' in memory)) return null;
  return typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}

interface GpuInfoSource {
  readonly RENDERER: number;
  getExtension(
    name: 'WEBGL_debug_renderer_info',
  ): { readonly UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(name: number): unknown;
}

export function readGpuName(context: GpuInfoSource): string {
  const debug = context.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = context.getParameter(
    debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER,
  );
  return typeof name === 'string' ? name : '';
}
