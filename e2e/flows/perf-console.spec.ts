import { expect, test, type Page } from '@playwright/test';
import { HEAVY_LAYOUT_TIMEOUT_MS, openHost, waitForView } from '../support.ts';

const KNOWN_WARNINGS: readonly RegExp[] = [
  /^THREE\.Clock: This module has been deprecated\. Please use THREE\.Timer instead\. \(/,
  /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/,
];

interface ConsoleLog {
  readonly errors: string[];
  readonly warnings: string[];
}

function watchConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { errors: [], warnings: [] };
  page.on('console', (message) => {
    const where = message.location().url;
    if (message.type() === 'error') log.errors.push(`${message.text()} (${where})`);
    if (message.type() === 'warning') log.warnings.push(`${message.text()} (${where})`);
  });
  page.on('pageerror', (error) => {
    log.errors.push(error.message);
  });
  return log;
}

function unexpectedWarnings(log: ConsoleLog): string[] {
  return log.warnings.filter((text) => !KNOWN_WARNINGS.some((known) => known.test(text)));
}

test('the editor logs no errors and no unexpected warnings while it is used', async ({ page }) => {
  const log = watchConsole(page);
  await page.goto('/');
  await waitForView(page, HEAVY_LAYOUT_TIMEOUT_MS);
  await page.getByRole('listbox', { name: 'Placed items' }).getByRole('option').first().click();
  await page
    .getByRole('region', { name: 'Equipment' })
    .getByRole('button', { name: 'Cabinet' })
    .click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Top' }).click();
  await page.getByRole('button', { name: 'Performance statistics' }).click();
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Fix clearance issues' }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  expect(log.errors).toEqual([]);
  expect(unexpectedWarnings(log)).toEqual([]);
});

for (const path of ['/?seed=500&perf=1', '/?seed=500&perf=1&instancing=off', '/?seed=2000']) {
  test(`the editor at ${path} logs no errors and no unexpected warnings`, async ({ page }) => {
    test.setTimeout(120_000);
    const log = watchConsole(page);
    await page.goto(path);
    await waitForView(page, HEAVY_LAYOUT_TIMEOUT_MS);
    await page.waitForTimeout(2000);
    expect(log.errors).toEqual([]);
    expect(unexpectedWarnings(log)).toEqual([]);
  });
}

test('the editor opened with embed=1 outside a host explains itself without console errors', async ({
  page,
}) => {
  const log = watchConsole(page);
  await page.goto('/?embed=1');
  await expect(
    page.getByRole('alertdialog', { name: 'Can’t connect to the host application' }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  expect(log.errors).toEqual([]);
  expect(unexpectedWarnings(log)).toEqual([]);
});

test('host.html with the embedded editor logs no errors and no unexpected warnings', async ({
  page,
}) => {
  const log = watchConsole(page);
  const editor = await openHost(page);
  await waitForView(editor, HEAVY_LAYOUT_TIMEOUT_MS);
  await page.getByRole('button', { name: 'Rotate token now' }).click();
  await page.locator('#locale-select').selectOption('vi');
  await page.locator('#locale-select').selectOption('en');
  await page.getByRole('switch', { name: 'Match the Northwind theme' }).uncheck();
  await editor.getByRole('button', { name: 'Send BOM to quote' }).click();
  await page.waitForTimeout(1500);
  expect(log.errors).toEqual([]);
  expect(unexpectedWarnings(log)).toEqual([]);
});

test('bench.html logs no errors and no unexpected warnings during a run', async ({ page }) => {
  test.setTimeout(180_000);
  const log = watchConsole(page);
  await page.goto('/bench.html');
  await expect(page.getByRole('status')).toContainText('Done.', { timeout: 150_000 });
  expect(log.errors).toEqual([]);
  expect(unexpectedWarnings(log)).toEqual([]);
});
