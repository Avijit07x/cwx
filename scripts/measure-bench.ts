import { loadavg } from 'node:os';
import { parseArgs } from 'node:util';
import type { Browser } from '@playwright/test';
import { z } from 'zod';
import { VARIANT_FILES, VARIANT_IDS, type VariantId } from '../src/bench/model.ts';
import { BENCH_TIMINGS, median } from '../src/bench/protocol.ts';
import {
  assertAppleMetal,
  channelOption,
  collectErrors,
  DEFAULT_BASE,
  isolatedContext,
  launch,
  launchFlags,
  machineInfo,
  numberIn,
  probeBrowser,
  round,
  VIEWPORT,
  WEBSOCKET_NOTE,
  writeJson,
} from './measure-fps.ts';
import { exists, publicPath } from './toolchain.ts';

const LOAD_TIMEOUT_MS = 300_000;
const FRAME_RUN_TIMEOUT_MS = 1_800_000;
const PROBLEM = /failed|not found|not available/i;
const STATUS = `(document.querySelector('[role="status"]')?.textContent ?? '')`;

const USAGE =
  'Usage: node scripts/measure-bench.ts <out.json> [--base=http://127.0.0.1:5173] [--channel=chromium|chrome] [--runs=5] [--models=raw,opt,lod1,lod2] [--copies=100,1000] [--label=text]';

const FIRST_FRAME_HOOK = `(() => {
  performance.setResourceTimingBufferSize(100000);
  const proto = WebGL2RenderingContext.prototype;
  const readPixels = proto.readPixels;
  proto.readPixels = function (...args) {
    const result = readPixels.apply(this, args);
    if (window.measureFirstFrame === undefined && args[2] === 1 && args[3] === 1) {
      const ms = performance.now();
      const debug = this.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(this.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : this.RENDERER));
      window.measureFirstFrame = { ms, gpu };
    }
    return result;
  };
})();`;

const GPU_SYNCED_FRAMES = `(() => {
  const contexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const context = getContext.apply(this, args);
    if (context instanceof WebGL2RenderingContext && !contexts.includes(context)) contexts.push(context);
    return context;
  };
  const pixel = new Uint8Array(4);
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    request(() => {
      for (const gl of contexts) {
        if (!gl.isContextLost()) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      callback(performance.now());
    });
})();`;

const FIRST_FRAME_OR_PROBLEM = `window.measureFirstFrame ?? (${PROBLEM.toString()}.test(${STATUS}) ? ${STATUS} : undefined)`;
const FINISHED_OR_PROBLEM = `(/Done[.]/.test(${STATUS}) || ${PROBLEM.toString()}.test(${STATUS})) ? ${STATUS} : undefined`;

const RESULTS_TABLE = `Object.fromEntries(
  [...document.querySelectorAll('table tr')]
    .map((row) => [row.querySelector('th')?.textContent?.trim() ?? '', row.querySelector('td')?.textContent?.trim() ?? ''])
    .filter(([label, value]) => label !== '' && value !== '')
)`;

function coldTimingScript(file: string): string {
  return `(() => {
    const model = performance.getEntriesByType('resource').find((entry) => entry.name.endsWith(${JSON.stringify(`/${file}`)}));
    return {
      firstFrame: window.measureFirstFrame,
      modelFetchStartMs: model ? model.startTime : null,
      modelFetchEndMs: model ? model.responseEnd : null,
      modelBytes: model ? model.encodedBodySize : null,
    };
  })()`;
}

const coldTiming = z.object({
  firstFrame: z.object({ ms: z.number(), gpu: z.string() }),
  modelFetchStartMs: z.number().nullable(),
  modelFetchEndMs: z.number().nullable(),
  modelBytes: z.number().nullable(),
});
const resultsTable = z.record(z.string(), z.string());

function benchUrl(base: string, model: VariantId, copies: number, instancing: boolean): string {
  return `${base}/bench.html?model=${model}&copies=${copies}&instancing=${instancing ? 'on' : 'off'}`;
}

async function coldLoad(browser: Browser, base: string, model: VariantId) {
  const context = await isolatedContext(browser);
  try {
    const page = await context.newPage();
    const consoleErrors = collectErrors(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript({ content: FIRST_FRAME_HOOK });
    await page.goto(benchUrl(base, model, 1, true));
    const handle = await page.waitForFunction(FIRST_FRAME_OR_PROBLEM, undefined, {
      polling: 50,
      timeout: LOAD_TIMEOUT_MS,
    });
    const settled: unknown = await handle.jsonValue();
    if (typeof settled === 'string') throw new Error(`bench.html?model=${model}: ${settled}`);
    const timing = coldTiming.parse(await page.evaluate(coldTimingScript(VARIANT_FILES[model])));
    const firstFrameMs = timing.firstFrame.ms;
    return {
      navigationToFirstFrameMs: round(firstFrameMs),
      modelFetchStartMs: timing.modelFetchStartMs === null ? null : round(timing.modelFetchStartMs),
      modelFetchEndMs: timing.modelFetchEndMs === null ? null : round(timing.modelFetchEndMs),
      decodeToFirstFrameMs:
        timing.modelFetchEndMs === null ? null : round(firstFrameMs - timing.modelFetchEndMs),
      modelBytes: timing.modelBytes,
      gpu: timing.firstFrame.gpu,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

async function attempt<T>(task: () => Promise<T>): Promise<T | { readonly error: string }> {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  failed: ${message}`);
    return { error: message };
  }
}

async function frameRun(browser: Browser, url: string) {
  const context = await isolatedContext(browser);
  try {
    const page = await context.newPage();
    const consoleErrors = collectErrors(page);
    await page.addInitScript({ content: GPU_SYNCED_FRAMES });
    const started = performance.now();
    await page.goto(url);
    const handle = await page.waitForFunction(FINISHED_OR_PROBLEM, undefined, {
      polling: 500,
      timeout: FRAME_RUN_TIMEOUT_MS,
    });
    const status = z.string().parse(await handle.jsonValue());
    if (!status.includes('Done')) throw new Error(`${url}: ${status}`);
    const table = resultsTable.parse(await page.evaluate(RESULTS_TABLE));
    return {
      frameAvgMs: numberIn(table['Frame time, average']),
      frameP95Ms: numberIn(table['Frame time, 95th percentile']),
      fps: numberIn(table['Frame rate, average']),
      cpuInRenderMs: numberIn(table['CPU time in render(), average']),
      framesMeasured: numberIn(table['Frames measured']),
      drawCalls: numberIn(table['Draw calls per frame']),
      triangles: numberIn(table['Triangles per frame']),
      gpu: table.GPU,
      wallClockS: round((performance.now() - started) / 1000),
      table,
      consoleErrors,
    };
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
      runs: { type: 'string', default: '5' },
      models: { type: 'string', default: VARIANT_IDS.join(',') },
      copies: { type: 'string', default: '100,1000' },
      label: { type: 'string' },
    },
  });
  const [out] = positionals;
  if (out === undefined) throw new Error(USAGE);
  const channel = channelOption.parse(values.channel);
  const runs = z.coerce.number().int().positive().parse(values.runs);
  const models = z.array(z.enum(VARIANT_IDS)).parse(values.models.split(','));
  const copyCounts = z
    .array(z.enum(['100', '1000']))
    .parse(values.copies.split(','))
    .map(Number);
  const startedAt = new Date();
  const machine = machineInfo();

  const available: VariantId[] = [];
  const skipped = [];
  for (const model of models) {
    const file = publicPath(VARIANT_FILES[model]);
    if (await exists(file)) {
      available.push(model);
      continue;
    }
    const reason =
      model === 'raw'
        ? `${file} is missing: the raw model is git-ignored. Run pnpm assets:fetch, then measure again.`
        : `${file} is missing. Run pnpm assets:optimize, then measure again.`;
    console.warn(`Skipping ${model}: ${reason}`);
    skipped.push({ model, reason });
  }

  const browser = await launch(channel, 'uncapped');
  const coldLoads = [];
  const frames = [];
  let probe;
  try {
    probe = await probeBrowser(browser);
    for (const model of available) {
      const results = [];
      for (let run = 1; run <= runs; run++) {
        console.log(`Cold load, ${model}, run ${run} of ${runs}`);
        const result = await attempt(() => coldLoad(browser, values.base, model));
        if (!('error' in result)) assertAppleMetal(result.gpu);
        results.push(result);
      }
      const measured = results.flatMap((result) => ('error' in result ? [] : [result]));
      const decode = measured.flatMap((result) => result.decodeToFirstFrameMs ?? []);
      coldLoads.push({
        model,
        file: VARIANT_FILES[model],
        successfulRuns: measured.length,
        medianNavigationToFirstFrameMs:
          measured.length === 0
            ? null
            : round(median(measured.map((result) => result.navigationToFirstFrameMs))),
        medianDecodeToFirstFrameMs:
          decode.length > 0 && decode.length === measured.length ? round(median(decode)) : null,
        runs: results,
      });
    }
    for (const model of available) {
      for (const copies of copyCounts) {
        for (const instancing of [true, false]) {
          const url = benchUrl(values.base, model, copies, instancing);
          console.log(`Frame time: ${url}`);
          const result = await attempt(() => frameRun(browser, url));
          if (!('error' in result)) assertAppleMetal(result.gpu);
          frames.push({ model, copies, instancing, url, ...result });
        }
      }
    }
  } finally {
    await browser.close();
  }

  await writeJson(out, {
    label: values.label ?? null,
    script: 'scripts/measure-bench.ts',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationS: round((Date.now() - startedAt.getTime()) / 1000),
    base: values.base,
    viewport: VIEWPORT,
    browser: { channel, flags: launchFlags('uncapped'), ...probe },
    coldLoadMethod: `median of ${runs} runs; each run opens a fresh browser context with the HTTP cache disabled, loads bench.html?model=<id>&copies=1, and times navigation start to the first 1 x 1 readPixels, which the page issues right after drawing the decoded model (GPU-synchronised); the contexts share one browser, so compiled GPU shaders can carry over between runs, and every run is listed`,
    frameMethod: `bench page's own protocol and results table, uncapped: ${BENCH_TIMINGS.loadRuns} in-page loads, ${BENCH_TIMINGS.warmupMs} ms warm-up, ${BENCH_TIMINGS.measureMs} ms of frame intervals; the page ends every in-page load and every frame with a 1 x 1 readPixels, so frames cannot queue up ahead of the GPU and each interval is one frame's full CPU + GPU time. The harness also issues a 1 x 1 readPixels at the start of every animation-frame callback, which repeats the page's sync for frame intervals and drains leftover GPU work before each in-page load run starts; it is kept so new runs measure the same way as the published ones`,
    webSockets: WEBSOCKET_NOTE,
    machine: { ...machine, loadAverageAtEnd: loadavg().map(round) },
    skipped,
    coldLoads,
    frames,
  });
  console.table(
    coldLoads.map(({ model, medianNavigationToFirstFrameMs, medianDecodeToFirstFrameMs }) => ({
      model,
      medianNavigationToFirstFrameMs,
      medianDecodeToFirstFrameMs,
    })),
  );
  console.table(
    frames.map((frame) =>
      'error' in frame
        ? {
            model: frame.model,
            copies: frame.copies,
            instancing: frame.instancing,
            error: frame.error,
          }
        : {
            model: frame.model,
            copies: frame.copies,
            instancing: frame.instancing,
            frameAvgMs: frame.frameAvgMs,
            frameP95Ms: frame.frameP95Ms,
            drawCalls: frame.drawCalls,
          },
    ),
  );
}

await main();
