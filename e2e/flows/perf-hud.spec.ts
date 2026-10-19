import type { Page } from '@playwright/test';
import {
  expect,
  HEAVY_LAYOUT_TIMEOUT_MS,
  hudNumber,
  hudText,
  listRow,
  openEditor,
  paletteCard,
  performanceOverlay,
  test,
} from '../support.ts';

const COUNT_DRAWS = `(() => {
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
  }
  const tick = () => {
    draws.frames.push(draws.current);
    if (draws.frames.length > 240) draws.frames.shift();
    draws.current = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function recentFrameDraws(page: Page): Promise<number[]> {
  const raw: unknown = await page.evaluate('JSON.stringify(window.qaDraws.frames.slice(-60))');
  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'number') : [];
}

function mostCommon(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function settledHud(page: Page, drawCalls: number): Promise<void> {
  await expect(performanceOverlay(page)).toBeVisible();
  await expect.poll(() => hudNumber(page, 'Draw calls'), { timeout: 30_000 }).toBe(drawCalls);
}

test('with continuous rendering on, the overlay measures the frame rate', async ({ page }) => {
  await openEditor(page, '/?perf=1');
  await expect.poll(() => hudText(page, 'Frame rate (CPU)')).toMatch(/^\d[\d,]* fps$/);
});

test('an empty room costs 4 draw calls in the performance overlay', async ({ page }) => {
  await openEditor(page, '/?seed=0&perf=1', HEAVY_LAYOUT_TIMEOUT_MS);
  await settledHud(page, 4);
  expect(await hudText(page, 'Items')).toBe('0');
  expect(await hudText(page, 'Instancing')).toBe('On');
});

test('500 items cost 10 draw calls with instancing and 506 without, for the same triangles', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page, '/?seed=500&perf=1', HEAVY_LAYOUT_TIMEOUT_MS);
  await settledHud(page, 10);
  expect(await hudText(page, 'Items')).toBe('500');
  expect(await hudText(page, 'Instancing')).toBe('On');
  const triangles = await hudNumber(page, 'Triangles');
  expect(triangles).toBe(112_828);

  await openEditor(page, '/?seed=500&perf=1&instancing=off', HEAVY_LAYOUT_TIMEOUT_MS);
  await settledHud(page, 506);
  expect(await hudText(page, 'Instancing')).toBe('Off');
  expect(await hudNumber(page, 'Triangles')).toBe(triangles);
});

test('the overlay’s draw-call count matches the draw calls WebGL actually receives each frame', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript({ content: COUNT_DRAWS });
  for (const [path, expected] of [
    ['/?seed=500&perf=1', 10],
    ['/?seed=500&perf=1&instancing=off', 506],
  ] as const) {
    await openEditor(page, path, HEAVY_LAYOUT_TIMEOUT_MS);
    await settledHud(page, expected);
    await expect
      .poll(async () => (await recentFrameDraws(page)).filter((draws) => draws > 0).length, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(3);
    const drawing = (await recentFrameDraws(page)).filter((draws) => draws > 0);
    expect(mostCommon(drawing), path).toBe(expected);
  }
});

test('an idle editor draws nothing until the performance overlay switches on continuous rendering', async ({
  page,
}) => {
  await page.addInitScript({ content: COUNT_DRAWS });
  await openEditor(page, '/', HEAVY_LAYOUT_TIMEOUT_MS);
  await page.waitForTimeout(2500);
  const idle = await recentFrameDraws(page);
  expect(
    idle.slice(-30).every((draws) => draws === 0),
    `frames with draws while idle: ${String(idle.slice(-30).filter((d) => d > 0).length)}`,
  ).toBe(true);

  const toggle = page.getByRole('button', { name: 'Performance statistics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await settledHud(page, 10);
  const busy = await recentFrameDraws(page);
  expect(busy.slice(-20).filter((draws) => draws > 0).length).toBeGreaterThan(10);

  await toggle.click();
  await expect(performanceOverlay(page)).toHaveCount(0);
  await page.waitForTimeout(2500);
  const idleAgain = await recentFrameDraws(page);
  expect(idleAgain.slice(-30).every((draws) => draws === 0)).toBe(true);
});

test('2,000 items still cost 10 draw calls with instancing', async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page, '/?seed=2000&perf=1', HEAVY_LAYOUT_TIMEOUT_MS);
  await settledHud(page, 10);
  expect(await hudText(page, 'Items')).toBe('2,000');
});

test('selecting, placing, previewing and undoing return the geometry and texture counts to where they started', async ({
  page,
}) => {
  await openEditor(page, '/?perf=1', HEAVY_LAYOUT_TIMEOUT_MS);
  await settledHud(page, 10);
  const baseline = {
    geometries: await hudNumber(page, 'Geometries'),
    textures: await hudNumber(page, 'Textures'),
  };
  for (let round = 0; round < 3; round += 1) {
    await listRow(page, 'CAB-01').click();
    await expect.poll(() => hudNumber(page, 'Draw calls')).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    await page
      .getByRole('region', { name: 'Equipment' })
      .getByRole('button', { name: 'UPS' })
      .click();
    await expect.poll(() => hudNumber(page, 'Draw calls')).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Fix clearance issues' }).click();
    await page.getByRole('button', { name: 'Reject' }).last().click();
    await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
    await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);
  }
  await expect
    .poll(async () => ({
      geometries: await hudNumber(page, 'Geometries'),
      textures: await hudNumber(page, 'Textures'),
    }))
    .toEqual(baseline);
});

test('the clearance halo fill is drawn in one pass, for the selection and for the placement ghost', async ({
  page,
}) => {
  await openEditor(page, '/?perf=1');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);

  await listRow(page, 'CAB-01').click();
  await page.mouse.move(5, 5);
  await expect
    .poll(() => hudNumber(page, 'Draw calls'), { message: 'box edges, halo line and halo fill' })
    .toBe(10 + 3);

  await page.keyboard.press('Escape');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);
  await paletteCard(page, 'UPS').click();
  await expect
    .poll(() => hudNumber(page, 'Draw calls'), {
      message: 'ghost mesh, outline, halo line and halo fill',
    })
    .toBe(10 + 4);
});
