import { test as testWithConsoleErrors, type Locator, type Page } from '@playwright/test';
import {
  expect,
  FIRST_RENDER_TIMEOUT_MS,
  itemList,
  openEditor,
  shortcutDialog,
  test,
  waitForView,
} from '../support.ts';

const VIEWPORT_MODULE = '**/src/viewport/Viewport.tsx*';
const ASSISTANT_CODE = /\/(src\/AssistantTab\.tsx|assets\/AssistantTab-[\w-]+\.js)/;
const SHORTCUT_MODULES = '/src/features/shortcuts/';

function assistantTab(page: Page): Locator {
  return page.getByRole('tab', { name: 'Assistant' });
}

function shortcutRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(SHORTCUT_MODULES)) urls.push(pathname);
  });
  return urls;
}

test('the 3D view placeholder is a status message while its code downloads', async ({ page }) => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(VIEWPORT_MODULE, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');

  await expect(page.getByRole('status').filter({ hasText: 'Loading 3D view…' })).toBeVisible();
  release();
  await waitForView(page);
});

testWithConsoleErrors(
  'Try again loads the 3D view after its code failed to download once',
  async ({ page }) => {
    let offline = true;
    await page.route(VIEWPORT_MODULE, (route) =>
      offline ? route.abort('internetdisconnected') : route.continue(),
    );
    await page.goto('/');
    const failure = page.getByRole('alert').filter({ hasText: 'The 3D view stopped working.' });
    await expect(failure).toBeVisible();

    offline = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await waitForView(page);
    await expect(failure).toHaveCount(0);
  },
);

test('the assistant loads in its hidden tab before it is opened, so the first opening shows it at once', async ({
  page,
}) => {
  await page.goto('/');
  const composer = page.getByRole('textbox', {
    name: 'Message to the assistant',
    includeHidden: true,
  });
  await expect(composer).toBeAttached({ timeout: FIRST_RENDER_TIMEOUT_MS });

  await assistantTab(page).click();

  expect(await composer.isVisible()).toBe(true);
});

testWithConsoleErrors(
  'when the assistant fails to download, the rest of the editor keeps working and Try again loads it',
  async ({ page }) => {
    let offline = true;
    await page.route(ASSISTANT_CODE, (route) =>
      offline ? route.abort('internetdisconnected') : route.continue(),
    );
    await page.goto('/');

    await expect(itemList(page)).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT_MS });
    await assistantTab(page).click();
    const failure = page
      .getByRole('tabpanel', { name: 'Assistant' })
      .getByRole('alert')
      .filter({ hasText: 'The assistant could not be loaded.' });
    await expect(failure).toBeVisible();
    await expect(page.getByText('The editor stopped working.')).toHaveCount(0);

    offline = false;
    await failure.getByRole('button', { name: 'Try again' }).click();
    await assistantTab(page).click({ timeout: FIRST_RENDER_TIMEOUT_MS });

    await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeVisible({
      timeout: FIRST_RENDER_TIMEOUT_MS,
    });
  },
);

test('the shortcut list is downloaded when the dialog first opens, and closing gives focus back to the trigger', async ({
  page,
}) => {
  const requests = shortcutRequests(page);
  await openEditor(page);
  const loadedWithEditor = requests.length;
  const trigger = page.getByRole('button', { name: 'Keyboard shortcuts' });

  await trigger.click();
  await expect(shortcutDialog(page)).toBeVisible();
  const loadedOnOpen = requests.slice(loadedWithEditor);
  expect(loadedOnOpen.length, 'modules fetched when the dialog first opened').toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(shortcutDialog(page)).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(shortcutDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(requests.slice(loadedWithEditor)).toEqual(loadedOnOpen);
});

testWithConsoleErrors(
  'when the shortcut list cannot be downloaded, the editor keeps working and says so',
  async ({ page }) => {
    const requests = shortcutRequests(page);
    await openEditor(page);
    const loadedWithEditor = new Set(requests);
    await page.route(
      (url) => url.pathname.startsWith(SHORTCUT_MODULES) && !loadedWithEditor.has(url.pathname),
      (route) => route.abort(),
    );
    const trigger = page.getByRole('button', { name: 'Keyboard shortcuts' });

    await trigger.click();

    const notice = page.getByText('The shortcut list could not be loaded.', { exact: false });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(1);
    await expect(shortcutDialog(page)).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('banner')).toBeVisible();
    await itemList(page).getByRole('option').first().click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveCount(0);
  },
);
