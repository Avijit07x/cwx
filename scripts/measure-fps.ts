import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, loadavg, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';
import { median, percentile } from '../src/bench/protocol.ts';

export const DEFAULT_BASE = 'http://127.0.0.1:5173';
export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const channelOption = z.enum(['chromium', 'chrome']);
export type Channel = z.infer<typeof channelOption>;
export type Vsync = 'capped' | 'uncapped';

const CANVAS = 'canvas[data-engine^="three.js"]';
const SEED = 500;
const HUD_TIMEOUT_MS = 180_000;
const REFRESH_PROBE_MS = 2000;
const EDGE_INSET_PX = 16;
const ORBIT_LEAD_MS = 500;
const ORBIT_PERIOD_MS = 2000;
const ORBIT_SPAN_PX = 320;
const ORBIT_STEP_MS = 8;

const USAGE =
  'Usage: node scripts/measure-fps.ts <out.json> [--base=http://127.0.0.1:5173] [--channel=chromium|chrome] [--warmup=3] [--window=10] [--label=text]';

const GPU_PROBE = `(() => {
  const context = document.createElement('canvas').getContext('webgl2');
  if (!context) return 'no WebGL2 context';
  const debug = context.getExtension('WEBGL_debug_renderer_info');
  return String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER));
})()`;

const CANVAS_INFO = `(() => {
  const canvas = document.querySelector('${CANVAS}');
  return canvas && {
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
    devicePixelRatio: window.devicePixelRatio,
  };
})()`;

const HUD_SNAPSHOT = `(() => {
  const hud = document.querySelector('section[aria-label="Performance"]');
  if (!hud) return {};
  return Object.fromEntries(
    [...hud.querySelectorAll('dt')].map((label) => [
      label.textContent.trim(),
      label.nextElementSibling?.textContent?.trim() ?? '',
    ]),
  );
})()`;

const hudSnapshot = z.record(z.string(), z.string());
const frameSample = z.object({
  times: z.array(z.number()),
  wallMs: z.number(),
  drainMs: z.number(),
  sizes: z.array(z.string()),
});
type FrameSample = z.infer<typeof frameSample>;
const point = z.object({ x: z.number(), y: z.number() });
type Point = z.infer<typeof point>;
const canvasInfo = z.object({
  cssWidth: z.number(),
  cssHeight: z.number(),
  bufferWidth: z.number(),
  bufferHeight: z.number(),
  devicePixelRatio: z.number(),
});
const seconds = z.coerce.number().positive();

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function numberIn(text: string | undefined): number | null {
  const match = /\d[\d,]*(?:\.\d+)?/.exec(text ?? '');
  return match ? Number(match[0].replaceAll(',', '')) : null;
}

export function launchFlags(vsync: Vsync): string[] {
  return [
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
    ...(vsync === 'uncapped' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ];
}

export function launch(channel: Channel, vsync: Vsync): Promise<Browser> {
  return chromium.launch({ channel, headless: true, args: launchFlags(vsync) });
}

export const WEBSOCKET_NOTE =
  'every WebSocket, including the Vite HMR socket on the dev server, gets a silent mock, so edits to src cannot reload the page mid-run';

export async function isolatedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.routeWebSocket(/./, () => undefined);
  return context;
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

export function assertAppleMetal(gpu: string | undefined): string {
  const name = gpu ?? 'unknown';
  if (/swiftshader|llvmpipe|software/i.test(name)) {
    throw new Error(`WebGL is running on a software renderer, not the GPU: ${name}. Aborting.`);
  }
  if (!/ANGLE Metal Renderer: Apple/.test(name)) {
    throw new Error(`Expected the Apple GPU through ANGLE Metal, got: ${name}. Aborting.`);
  }
  return name;
}

export async function probeBrowser(browser: Browser) {
  const page = await browser.newPage();
  try {
    return {
      version: browser.version(),
      userAgent: z.string().parse(await page.evaluate('navigator.userAgent')),
      gpu: assertAppleMetal(z.string().parse(await page.evaluate(GPU_PROBE))),
    };
  } finally {
    await page.close();
  }
}

function shell(file: string, args: readonly string[]): string | null {
  try {
    return execFileSync(file, args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function machineInfo() {
  const darwin = process.platform === 'darwin';
  return {
    cpu: cpus()[0]?.model ?? null,
    logicalCores: cpus().length,
    memoryGiB: round(totalmem() / 2 ** 30),
    os: darwin
      ? `macOS ${shell('sw_vers', ['-productVersion']) ?? 'unknown'}`
      : `${process.platform} ${release()}`,
    powerSource: darwin
      ? (/'([^']+)'/.exec(shell('pmset', ['-g', 'ps']) ?? '')?.[1] ?? null)
      : null,
    node: process.version,
    loadAverageAtStart: loadavg().map(round),
  };
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  const file = resolve(path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${file}`);
}

function sampleScript(durationMs: number): string {
  return `new Promise((resolve) => {
    const canvas = document.querySelector('${CANVAS}');
    const gl = canvas ? canvas.getContext('webgl2') : null;
    const pixel = new Uint8Array(4);
    const drain = () => {
      if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return performance.now();
    };
    const times = [];
    const sizes = new Set();
    let started;
    const tick = (time) => {
      if (started === undefined) {
        started = drain();
      } else {
        times.push(time);
        if (canvas) sizes.add(canvas.width + ' x ' + canvas.height);
      }
      const now = performance.now();
      if (now - started < ${durationMs}) {
        requestAnimationFrame(tick);
        return;
      }
      const drained = drain();
      resolve({ times, wallMs: drained - started, drainMs: drained - now, sizes: [...sizes] });
    };
    requestAnimationFrame(tick);
  })`;
}

async function sampleFrames(page: Page, durationMs: number): Promise<FrameSample> {
  return frameSample.parse(await page.evaluate(sampleScript(durationMs)));
}

function intervalsOf(times: readonly number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? time));
}

function framesPerSecond(times: readonly number[]): number[] {
  const first = times[0] ?? 0;
  const counts = new Array<number>(Math.floor(((times.at(-1) ?? first) - first) / 1000)).fill(0);
  for (const time of times.slice(1)) {
    const second = Math.floor((time - first) / 1000);
    if (second < counts.length) counts[second] = (counts[second] ?? 0) + 1;
  }
  return counts;
}

function frameStats({ times, wallMs, drainMs }: FrameSample) {
  const intervals = intervalsOf(times);
  if (intervals.length === 0) throw new Error('No animation frames were recorded.');
  const perSecond = framesPerSecond(times);
  return {
    frames: times.length,
    windowMs: round(wallMs),
    meanFps: round((times.length * 1000) / wallMs),
    medianFps: median(perSecond),
    framesPerSecond: perSecond,
    medianFrameMs: round(median(intervals)),
    p95FrameMs: round(percentile(intervals, 95)),
    p99FrameMs: round(percentile(intervals, 99)),
    maxFrameMs: round(Math.max(...intervals)),
    gpuDrainMs: round(drainMs),
  };
}

async function refreshRateHz(browser: Browser): Promise<number> {
  const page = await browser.newPage();
  try {
    const { times } = await sampleFrames(page, REFRESH_PROBE_MS);
    return round(1000 / median(intervalsOf(times)));
  } finally {
    await page.close();
  }
}

async function readHud(page: Page): Promise<Record<string, string>> {
  return hudSnapshot.parse(await page.evaluate(HUD_SNAPSHOT));
}

async function settledHud(page: Page, instancing: boolean): Promise<Record<string, string>> {
  const deadline = Date.now() + HUD_TIMEOUT_MS;
  for (;;) {
    const hud = await readHud(page);
    const complete = hud.GPU !== undefined && numberIn(hud['Draw calls']) !== null;
    if (complete && numberIn(hud.Items) === SEED && /\d/.test(hud['Frame rate (CPU)'] ?? '')) {
      const expected = instancing ? 'On' : 'Off';
      if (hud.Instancing !== expected) {
        throw new Error(
          `The overlay shows instancing ${hud.Instancing ?? 'missing'}, expected ${expected}.`,
        );
      }
      return hud;
    }
    if (Date.now() > deadline) {
      throw new Error(`The performance overlay never showed ${SEED} items: ${JSON.stringify(hud)}`);
    }
    await sleep(250);
  }
}

async function orbitStart(page: Page): Promise<Point> {
  const box = await page.locator(CANVAS).boundingBox();
  if (!box) throw new Error('The 3D canvas has no layout box.');
  const candidates = [0.5, 0.6, 0.4, 0.7, 0.3].map((fraction) => ({
    x: Math.round(box.x + EDGE_INSET_PX),
    y: Math.round(box.y + box.height * fraction),
  }));
  const free: unknown = await page.evaluate(`(() => {
    const canvas = document.querySelector('${CANVAS}');
    return ${JSON.stringify(candidates)}.find((p) => document.elementFromPoint(p.x, p.y) === canvas) ?? null;
  })()`);
  const spot = point.nullable().parse(free);
  if (!spot) throw new Error('Every candidate point on the canvas edge is covered by an overlay.');
  return spot;
}

async function orbit(page: Page, from: Point, stop: AbortSignal): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const started = performance.now();
  while (!stop.aborted) {
    const phase = ((performance.now() - started) / ORBIT_PERIOD_MS) % 2;
    await page.mouse.move(from.x + ORBIT_SPAN_PX * (1 - Math.abs(1 - phase)), from.y);
    await sleep(ORBIT_STEP_MS);
  }
  await page.mouse.up();
}

async function sampleWhileOrbiting(page: Page, windowMs: number): Promise<FrameSample> {
  const from = await orbitStart(page);
  const stop = new AbortController();
  const [, sample] = await Promise.all([
    orbit(page, from, stop.signal),
    sleep(ORBIT_LEAD_MS)
      .then(() => sampleFrames(page, windowMs))
      .finally(() => {
        stop.abort();
      }),
  ]);
  return sample;
}

async function summarise(page: Page, sample: FrameSample) {
  const hud = await readHud(page);
  return {
    ...frameStats(sample),
    drawCalls: numberIn(hud['Draw calls']),
    triangles: numberIn(hud.Triangles),
    canvas: canvasInfo.parse(await page.evaluate(CANVAS_INFO)),
    bufferSizesSeen: sample.sizes,
    resolutionChanged: sample.sizes.length > 1,
    hud,
    intervalsMs: intervalsOf(sample.times).map(round),
  };
}

interface EditorRun {
  readonly base: string;
  readonly vsync: Vsync;
  readonly instancing: boolean;
  readonly warmupMs: number;
  readonly windowMs: number;
}

async function measureEditor(browser: Browser, run: EditorRun) {
  const { base, vsync, instancing, warmupMs, windowMs } = run;
  const url = `${base}/?seed=${SEED}&perf=1${instancing ? '' : '&instancing=off'}`;
  const context = await isolatedContext(browser);
  try {
    const page = await context.newPage();
    const consoleErrors = collectErrors(page);
    console.log(`${vsync}, instancing ${instancing ? 'on' : 'off'}: ${url}`);
    await page.goto(url);
    assertAppleMetal((await settledHud(page, instancing)).GPU);
    await sleep(warmupMs);
    const still = await summarise(page, await sampleFrames(page, windowMs));
    const before = await page.locator(CANVAS).screenshot();
    const orbiting = await summarise(page, await sampleWhileOrbiting(page, windowMs));
    const after = await page.locator(CANVAS).screenshot();
    if (before.equals(after)) {
      throw new Error('Dragging from the canvas edge did not orbit the camera.');
    }
    return [
      { vsync, instancing, camera: 'static', url, ...still, consoleErrors: [...consoleErrors] },
      { vsync, instancing, camera: 'orbit', url, ...orbiting, consoleErrors: [...consoleErrors] },
    ];
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string', default: DEFAULT_BASE },
      channel: { type: 'string', default: 'chromium' },
      warmup: { type: 'string', default: '3' },
      window: { type: 'string', default: '10' },
      label: { type: 'string' },
    },
  });
  const [out] = positionals;
  if (out === undefined) throw new Error(USAGE);
  const channel = channelOption.parse(values.channel);
  const warmupS = seconds.parse(values.warmup);
  const windowS = seconds.min(1).parse(values.window);
  const startedAt = new Date();
  const machine = machineInfo();
  const browsers = [];
  const runs = [];
  let refreshHz: number | null = null;

  for (const vsync of ['capped', 'uncapped'] as const) {
    const browser = await launch(channel, vsync);
    try {
      browsers.push({
        vsync,
        channel,
        flags: launchFlags(vsync),
        ...(await probeBrowser(browser)),
      });
      if (vsync === 'capped') refreshHz = await refreshRateHz(browser);
      for (const instancing of [true, false]) {
        runs.push(
          ...(await measureEditor(browser, {
            base: values.base,
            vsync,
            instancing,
            warmupMs: warmupS * 1000,
            windowMs: windowS * 1000,
          })),
        );
      }
    } finally {
      await browser.close();
    }
  }

  await writeJson(out, {
    label: values.label ?? null,
    script: 'scripts/measure-fps.ts',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationS: round((Date.now() - startedAt.getTime()) / 1000),
    base: values.base,
    viewport: VIEWPORT,
    seed: SEED,
    warmupS,
    windowS,
    frameTimeSource: 'requestAnimationFrame timestamps in the page, one interval per frame',
    fpsDefinition:
      'each window starts and ends with a 1 x 1 readPixels on the app context, so meanFps (frames divided by that window) includes all GPU work; medianFps is the median of whole-second frame counts and the frame-time percentiles use single intervals, both on the requestAnimationFrame clock, which shows how fast the page issues frames; gpuDrainMs is how long the closing readPixels waited, and a value far above the frame time means the GPU fell behind and only meanFps is trustworthy',
    refreshRateHz: refreshHz,
    refreshRateSource:
      'median requestAnimationFrame interval on a blank page in the vsync-capped headless browser',
    webSockets: WEBSOCKET_NOTE,
    browsers,
    machine: { ...machine, loadAverageAtEnd: loadavg().map(round) },
    runs,
  });
  console.table(
    runs.map((run) => ({
      vsync: run.vsync,
      instancing: run.instancing,
      camera: run.camera,
      medianFps: run.medianFps,
      meanFps: run.meanFps,
      p95FrameMs: run.p95FrameMs,
      drawCalls: run.drawCalls,
      triangles: run.triangles,
    })),
  );
}

if (import.meta.main) await main();
