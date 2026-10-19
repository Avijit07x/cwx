import { test as testWithConsoleErrors, type Locator } from '@playwright/test';
import {
  expect,
  hudNumber,
  openEditor,
  openHost,
  test,
  viewportGroup,
  waitForView,
} from '../support.ts';

const VIEWPORT_CODE = /\/(src\/viewport\/Viewport\.tsx|assets\/Viewport-[\w-]+\.js)/;

async function loseContext(canvas: Locator): Promise<void> {
  await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('The 3D view has no canvas');
    element.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
}

testWithConsoleErrors(
  'an error in a panel shows a reload message instead of a blank page',
  async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Intl, 'Segmenter');
    });
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Filter placed items' }).fill('no such item');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The editor stopped working.');
    await expect(alert).toContainText('Reload the editor to continue.');
    await expect(alert.getByRole('button', { name: 'Reload editor' })).toBeVisible();
  },
);

testWithConsoleErrors(
  'when the embedded editor crashes, it shows the reload message and the host logs one crashed error',
  async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Intl, 'Segmenter');
    });
    const editor = await openHost(page);

    await editor.getByRole('searchbox', { name: 'Filter placed items' }).fill('no such item');

    await expect(editor.getByRole('alert')).toContainText('The editor stopped working.');
    const crashed = page
      .locator('#message-log > li[data-direction="received"][data-type="error"]')
      .filter({ hasText: '"crashed"' });
    await expect(crashed).toHaveCount(1);
    await expect(page.locator('#toasts')).toContainText('crashed');
  },
);

testWithConsoleErrors(
  'when only the 3D view fails, the host is not told that the editor crashed',
  async ({ page }) => {
    await page.route(VIEWPORT_CODE, (route) => route.abort('internetdisconnected'));
    const editor = await openHost(page);

    await expect(editor.getByRole('alert')).toContainText('The 3D view stopped working.');
    await expect(page.locator('#message-log > li[data-type="error"]')).toHaveCount(0);
  },
);

test('Reload 3D view, pressed from the keyboard, brings the view back with focus on it', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  await loseContext(canvas);
  const reload = page.getByRole('button', { name: 'Reload 3D view' });
  await reload.focus();
  await page.keyboard.press('Enter');
  await waitForView(page);
  await expect(viewportGroup(page)).toBeFocused();
});

test('the scene uploads no texture, so no remount leaves a renderer behind on three’s shared lookup texture', async ({
  page,
}) => {
  const canvas = await openEditor(page, '/?perf=1');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBeGreaterThan(4);
  await expect.poll(() => hudNumber(page, 'Textures')).toBe(0);
  await loseContext(canvas);
  await page.getByRole('button', { name: 'Reload 3D view' }).click();
  await waitForView(page);
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBeGreaterThan(4);
  await expect.poll(() => hudNumber(page, 'Textures')).toBe(0);
});
