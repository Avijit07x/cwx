import type { Page, PlaywrightWorkerArgs } from '@playwright/test';
import { existsSync } from 'node:fs';
import { expect, test } from '../support.ts';

const MODELS = ['raw', 'opt', 'lod1', 'lod2'] as const;
const MODES = ['on', 'off'] as const;
const FIRST_FRAME_TIMEOUT_MS: Readonly<Record<number, number>> = {
  1: 120_000,
  100: 600_000,
  1000: 1_800_000,
};

const EVERY_CONFIGURATION = process.env.QA_BENCH_ALL === '1';
const SLOW_RUN =
  'Set QA_BENCH_ALL=1 to run it: with software WebGL each bench configuration takes minutes';
const RAW_MODEL = new URL('../../public/models/raw/ABeautifulGame.glb', import.meta.url);
const NO_RAW_MODEL = 'Run pnpm assets:fetch to download the raw model';

type Model = (typeof MODELS)[number];
type Mode = (typeof MODES)[number];

const COUNT_FRAMES = `(() => {
  const draws = { current: 0, frames: [] };
  window.qaDraws = draws;
  const names = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of names) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function () {
        draws.current += 1;
        return original.apply(this, arguments);
      };
    }
    const readPixels = proto.readPixels;
    proto.readPixels = function () {
      draws.frames.push(draws.current);
      draws.current = 0;
      return readPixels.apply(this, arguments);
    };
  }
})();`;

function skipUnlessChosen(model: Model, chosen: boolean): void {
  test.skip(!chosen && !EVERY_CONFIGURATION, SLOW_RUN);
  test.skip(model === 'raw' && !existsSync(RAW_MODEL), NO_RAW_MODEL);
}

function benchUrl(model: Model, copies: number, mode: Mode): string {
  return `/bench.html?model=${model}&copies=${String(copies)}&instancing=${mode}`;
}

async function framesDrawn(page: Page): Promise<number[]> {
  const raw: unknown = await page.evaluate('JSON.stringify(window.qaDraws.frames)');
  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'number') : [];
}

async function firstFrameDrawCalls(
  page: Page,
  model: Model,
  copies: number,
  mode: Mode,
): Promise<number> {
  const timeout = FIRST_FRAME_TIMEOUT_MS[copies] ?? 120_000;
  await page.goto(benchUrl(model, copies, mode));
  const status = page.getByRole('status');
  await expect(status).toContainText('Load run 1 of 5', { timeout: 60_000 });
  await page.evaluate('window.qaDraws.current = 0; window.qaDraws.frames = [];');
  await expect
    .poll(async () => (await framesDrawn(page)).length, {
      timeout,
      intervals: [1000],
      message: `${model} × ${String(copies)}, instancing ${mode}: the first load run draws a frame`,
    })
    .toBeGreaterThan(0);
  await expect(status).not.toContainText(/failed|not found/);
  const [drawCalls = 0] = await framesDrawn(page);
  return drawCalls;
}

async function tableValue(page: Page, label: string): Promise<number> {
  const row = page.locator('tr', { has: page.locator('th', { hasText: new RegExp(`^${label}`) }) });
  return Number((await row.locator('td').innerText()).replace(/\D/g, ''));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: COUNT_FRAMES });
});

for (const model of MODELS) {
  for (const mode of MODES) {
    test(`bench: one ${model} copy with instancing ${mode} completes every load and frame measurement and reports the draw calls it made`, async ({
      page,
    }) => {
      skipUnlessChosen(model, model === 'opt' && mode === 'on');
      test.setTimeout(300_000);
      const firstFrame = await firstFrameDrawCalls(page, model, 1, mode);
      await expect(page.getByRole('status')).toContainText('Done.', { timeout: 240_000 });
      const reported = await tableValue(page, 'Draw calls per frame');
      const triangles = await tableValue(page, 'Triangles per frame');
      test.info().annotations.push({
        type: `${model} × 1, instancing ${mode}`,
        description: `table: ${String(reported)} draw calls, ${String(triangles)} triangles; WebGL saw ${String(firstFrame)} draw calls in the first frame`,
      });
      expect(reported, 'the table reports the draw calls WebGL received').toBe(firstFrame);
      expect(triangles).toBeGreaterThan(0);
    });
  }
}

async function inOwnBrowser<T>(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, baseURL });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await page.addInitScript({ content: COUNT_FRAMES });
    const result = await run(page);
    expect(errors, 'console errors in the benchmark').toEqual([]);
    return result;
  } finally {
    await browser.close();
  }
}

for (const copies of [100, 1000] as const) {
  for (const model of MODELS) {
    for (const mode of MODES) {
      test(`bench: ${String(copies)} ${model} copies with instancing ${mode} load and draw ${mode === 'on' ? 'the calls of one copy' : `${String(copies)} times the calls of one copy`}`, async ({
        playwright,
        baseURL,
      }) => {
        skipUnlessChosen(model, false);
        test.setTimeout((FIRST_FRAME_TIMEOUT_MS[copies] ?? 0) + 300_000);
        const { single, many } = await inOwnBrowser(playwright, baseURL, async (page) => ({
          single: await firstFrameDrawCalls(page, model, 1, mode),
          many: await firstFrameDrawCalls(page, model, copies, mode),
        }));
        test.info().annotations.push({
          type: `${model} × ${String(copies)}, instancing ${mode}`,
          description: `${String(many)} draw calls per frame; one copy: ${String(single)}`,
        });
        expect(many).toBe(mode === 'on' ? single : single * copies);
      });
    }
  }
}

test('bench: the KTX2 textures are decoded with the Basis transcoder three.js ships, not a copy in public/basis', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const transcoder: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.includes('basis_transcoder')) transcoder.push(pathname);
  });

  await page.goto('/bench.html');
  await expect(page.getByRole('status')).toContainText('Done.', { timeout: 150_000 });

  expect(transcoder).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/basis_transcoder[^/]*\.js$/),
      expect.stringMatching(/basis_transcoder[^/]*\.wasm$/),
    ]),
  );
  expect(transcoder.filter((path) => path.startsWith('/basis/'))).toEqual([]);
});
