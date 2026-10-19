import type { Locator } from '@playwright/test';
import {
  boxOf,
  cssOf,
  expect,
  itemList,
  listRow,
  openEditor,
  openHost,
  propertiesPanel,
  shortcutDialog,
  statusBar,
  systemColour,
  test,
} from '../support.ts';

async function size(locator: Locator): Promise<string> {
  const { width, height } = await boxOf(locator);
  return `${String(width)}x${String(height)}`;
}

test('semibold monospace text uses the real IBM Plex Mono 600 face', async ({ page }) => {
  await page.goto('/');
  await itemList(page).getByRole('option').first().click();
  await expect(propertiesPanel(page).locator('h3')).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (face) =>
            face.family.includes('IBM Plex Mono') &&
            face.weight === '600' &&
            face.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
});

test('a segmented control has the height and text size of a button of the same size', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'CAB-01').click();

  const cameraView = page.getByRole('radiogroup', { name: 'Camera view' });
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  expect((await boxOf(cameraView)).height).toBe((await boxOf(zoomIn)).height);
  expect(await cssOf(cameraView.getByRole('radio', { name: 'Top' }), 'font-size')).toBe(
    await cssOf(focus, 'font-size'),
  );

  const language = page.getByRole('radiogroup', { name: 'Language' });
  const assistant = page.getByRole('banner').getByRole('button', { name: 'Assistant' });
  expect((await boxOf(language)).height).toBe((await boxOf(assistant)).height);
  expect(await cssOf(language.getByRole('radio', { name: 'English' }), 'font-size')).toBe(
    await cssOf(assistant, 'font-size'),
  );
});

test('the inspector tabs and the sidebar section header draw their bottom rule on the same line', async ({
  page,
}) => {
  await openEditor(page);
  const sectionHeader = page.getByRole('heading', { name: 'Equipment', exact: true }).locator('..');
  const tablist = page.getByRole('tablist', { name: 'Inspector' });
  const header = await boxOf(sectionHeader);
  const tabs = await boxOf(tablist);
  expect(tabs.y + tabs.height).toBe(header.y + header.height);
});

test('a tab has the same rounded focus ring corners as the other controls', async ({ page }) => {
  await openEditor(page);
  const tab = page.getByRole('tab', { name: 'Inspect', exact: true });
  const radius = await cssOf(tab, 'border-top-left-radius');
  expect(radius).toBe(await cssOf(page.locator('html'), '--radius-sm'));
});

test('the pressed Assistant toggle has the subtle pressed look of the other toggles, not the solid fill of an action', async ({
  page,
}) => {
  await openEditor(page);
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Assistant' });
  const fillAndBorder = async () =>
    `${await cssOf(toggle, 'background-color')} / ${await cssOf(toggle, 'border-top-color')}`;
  const pressed = `${await systemColour(page, 'var(--color-ai-subtle)')} / ${await systemColour(page, 'var(--color-ai-border)')}`;
  const action = await systemColour(page, 'var(--color-ai)');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(fillAndBorder, { message: 'pressed, under the pointer' }).toBe(pressed);
  await page.mouse.move(0, 0);
  await expect.poll(fillAndBorder, { message: 'pressed' }).toBe(pressed);
  expect(pressed).not.toBe(`${action} / ${action}`);

  const send = page.getByRole('button', { name: 'Send' });
  await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Summarise');
  await expect.poll(() => cssOf(send, 'background-color')).toBe(action);
});

test('the embed error dialog has the same corner radius and backdrop as the shortcut dialog', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const shortcuts = shortcutDialog(page);
  await expect(shortcuts).toBeVisible();
  const reference = {
    radius: await shortcuts.evaluate((element) => getComputedStyle(element).borderRadius),
    backdrop: await page
      .locator('[data-open][aria-hidden="true"]')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  };

  await page.goto('/?embed=1');
  const error = page.getByRole('alertdialog', { name: 'Can’t connect to the host application' });
  await expect(error).toBeVisible();
  const embedded = await error.evaluate((element) => ({
    radius: getComputedStyle(element).borderRadius,
    backdrop: getComputedStyle(element, '::backdrop').backgroundColor,
  }));
  expect(embedded).toEqual(reference);
});

test('the connected badge sits in the sidebar with the raised shadow, not the floating overlay shadow', async ({
  page,
}) => {
  const editor = await openHost(page);
  const badge = editor.getByRole('region', { name: 'Host connection' });
  await expect(badge).toBeVisible();
  const shadows = await badge.evaluate((element) => {
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--shadow-raised)';
    document.body.append(probe);
    const raised = getComputedStyle(probe).boxShadow;
    probe.remove();
    return { badge: getComputedStyle(element).boxShadow, raised };
  });
  expect(shadows.badge).toBe(shadows.raised);
});

test('the placement preview swatch is solid, like the ghost outline drawn in the scene', async ({
  page,
}) => {
  await openEditor(page);
  const swatch = page
    .getByRole('region', { name: 'Legend' })
    .getByRole('listitem')
    .filter({ hasText: 'Placement preview' })
    .locator('span');
  await expect(swatch).toHaveCSS('border-top-style', 'solid');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a toast uses the app font and a dismiss button the size of a small icon button', async ({
    page,
  }) => {
    await openEditor(page);
    await itemList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Delete');
    await expect(statusBar(page)).toContainText('Saved');
    await page.reload();
    const toast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Restored your last draft.' });
    await expect(toast).toBeVisible();
    await toast.hover();

    expect(await cssOf(toast, 'font-family')).toBe(
      await cssOf(page.locator('body'), 'font-family'),
    );

    const dismiss = toast.getByRole('button', { name: 'Dismiss notification' });
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    expect(await size(dismiss)).toBe(await size(zoomIn));
    expect(await cssOf(dismiss, 'border-top-left-radius')).toBe(
      await cssOf(zoomIn, 'border-top-left-radius'),
    );
    expect(await size(dismiss.locator('svg'))).toBe(await size(zoomIn.locator('svg')));
  });
});
