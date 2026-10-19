import type { Locator, Page } from '@playwright/test';
import {
  blurFocus,
  EDITOR_ORIGIN,
  expect,
  itemList,
  openEditor,
  openHost,
  paletteCard,
  shortcutDialog,
  test,
  viewportGroup,
  type Box,
} from '../support.ts';

interface FocusedElement {
  readonly region: string;
  readonly label: string;
  readonly box: Box;
  readonly unobscured: boolean;
  readonly pageY: number;
}

interface TabStop extends FocusedElement {
  readonly indicatorVisible: boolean;
}

const HIDE_TOOLTIPS = '[data-base-ui-portal] > [data-side] { visibility: hidden !important; }';
const RING_MARGIN = 56;
const DIALOG_RING_MARGIN = 6;
const MAX_TAB_STOPS = 80;
const HUMAN_KEY_DELAY_MS = 20;

const INSPECT_ORDER = [
  'top bar',
  'Equipment',
  'Placed items',
  '3D view',
  'Bill of materials',
  'inspector tabs',
  'Properties',
  'Rule check',
];

const ASSISTANT_ORDER = [...INSPECT_ORDER.slice(0, 6), 'Layout assistant'];

function readFocusedElement(page: Page): Promise<FocusedElement | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const headingId = element.closest('section[aria-labelledby]')?.getAttribute('aria-labelledby');
    const heading = headingId ? document.getElementById(headingId) : null;
    const landmarks: readonly (readonly [string, string])[] = [
      ['[role="dialog"]', 'dialog'],
      ['[aria-roledescription="3D viewport"]', '3D view'],
      ['[role="tablist"], [role="tabpanel"]', 'inspector tabs'],
      ['header', 'top bar'],
    ];
    const landmark = landmarks.find(([selector]) => element.closest(selector) !== null);
    const region =
      element.closest('[role="dialog"]') === null && heading
        ? heading.textContent.trim()
        : (landmark?.[1] ?? 'outside every region');
    const rect = element.getBoundingClientRect();
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const right = Math.min(rect.right, window.innerWidth);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const hit =
      right > left && bottom > top
        ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
        : null;
    const labelled =
      element.getAttribute('aria-label') ??
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.labels?.[0]?.textContent
        : null) ??
      element.textContent;
    return {
      region,
      label: `${element.tagName.toLowerCase()} "${labelled.trim().slice(0, 40)}"`,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      unobscured: hit !== null && element.contains(hit),
      pageY: rect.top + window.scrollY,
    };
  });
}

function clipAround(page: Page, box: Box, margin: number): Box {
  const size = page.viewportSize();
  if (!size) throw new Error('The page has no viewport size');
  const x = Math.max(0, Math.floor(box.x - margin));
  const y = Math.max(0, Math.floor(box.y - margin));
  return {
    x,
    y,
    width: Math.min(size.width, Math.ceil(box.x + box.width + margin)) - x,
    height: Math.min(size.height, Math.ceil(box.y + box.height + margin)) - y,
  };
}

async function focusIndicatorVisible(page: Page, box: Box): Promise<boolean> {
  const clip = clipAround(page, box, RING_MARGIN);
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  const element = await page.evaluateHandle(() => document.activeElement);
  await blurFocus(page);
  const blurred = await page.screenshot({ clip, animations: 'disabled' });
  await element.asElement()?.focus();
  await element.dispose();
  return !focused.equals(blurred);
}

async function walkTabOrder(page: Page): Promise<readonly TabStop[]> {
  await page.addStyleTag({ content: HIDE_TOOLTIPS });
  await page.getByRole('banner').click({ position: { x: 2, y: 2 } });
  const stops: TabStop[] = [];
  for (let press = 0; press < MAX_TAB_STOPS; press++) {
    await page.keyboard.press('Tab');
    const focused = await readFocusedElement(page);
    if (!focused) return stops;
    stops.push({ ...focused, indicatorVisible: await focusIndicatorVisible(page, focused.box) });
  }
  throw new Error(`Tab never left the page after ${MAX_TAB_STOPS} presses`);
}

function regionOrder(stops: readonly TabStop[]): readonly string[] {
  return stops
    .map(({ region }) => region)
    .filter((region, index, regions) => region !== regions[index - 1]);
}

function describeStops(stops: readonly TabStop[]): readonly string[] {
  return stops.map(({ region, label }) => `${region}: ${label}`);
}

async function expectTabCycle(page: Page, expectedOrder: readonly string[]): Promise<void> {
  const stops = await walkTabOrder(page);
  console.log(describeStops(stops).join('\n'));
  expect.soft(regionOrder(stops), 'regions in Tab order').toEqual(expectedOrder);
  expect
    .soft(
      describeStops(stops.filter(({ indicatorVisible }) => !indicatorVisible)),
      'Tab stops with no visible focus indicator',
    )
    .toEqual([]);
  expect
    .soft(
      describeStops(stops.filter(({ unobscured }) => !unobscured)),
      'Tab stops hidden behind other content',
    )
    .toEqual([]);
}

async function expectFocusInside(container: Locator): Promise<void> {
  await expect
    .poll(() => container.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);
}

async function tabInsideShowingFocus(
  page: Page,
  container: Locator,
  key: 'Tab' | 'Shift+Tab',
): Promise<readonly string[]> {
  const unseen: string[] = [];
  for (let press = 0; press < 9; press++) {
    const focused = await readFocusedElement(page);
    if (!focused) throw new Error('Focus left the page');
    const clip = clipAround(page, focused.box, DIALOG_RING_MARGIN);
    const before = await page.screenshot({ clip, animations: 'disabled' });
    await page.keyboard.press(key, { delay: HUMAN_KEY_DELAY_MS });
    await expectFocusInside(container);
    const after = await page.screenshot({ clip, animations: 'disabled' });
    if (before.equals(after)) unseen.push(focused.label);
  }
  return unseen;
}

test('Tab visits the top bar, palette, item list, 3D view, inspector and properties in reading order with a visible, unobscured focus indicator', async ({
  page,
}) => {
  await openEditor(page);
  await itemList(page)
    .getByRole('option', { name: /CAB-01/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveValue('CAB-01');
  await expectTabCycle(page, INSPECT_ORDER);
});

test('Tab reaches the assistant after the 3D view when the Assistant tab is open, with a visible, unobscured focus indicator', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Assistant' }).click();
  await expect(page.getByRole('tab', { name: 'Assistant' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expectTabCycle(page, ASSISTANT_ORDER);
});

test('in the stacked layout at 800 px, Tab follows the top-to-bottom order of the regions on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await openEditor(page);
  const stops = await walkTabOrder(page);
  const regions = stops.filter((stop, index) => stop.region !== stops[index - 1]?.region);
  console.log(regions.map(({ region, pageY }) => `${region} at y ${Math.round(pageY)}`).join('\n'));
  expect(regions.map(({ region }) => region)).toEqual(
    regions.toSorted((a, b) => a.pageY - b.pageY).map(({ region }) => region),
  );
});

async function expectSelectedOption(page: Page, position: number, tag: string): Promise<void> {
  const list = itemList(page);
  const selected = list.getByRole('option', { selected: true });
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute('aria-posinset', String(position));
  await expect(selected).toContainText(tag);
  await expect(list).toHaveAttribute(
    'aria-activedescendant',
    (await selected.getAttribute('id')) ?? 'an option id',
  );
  await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveValue(tag);
}

test('the item list moves the selection with the arrow keys, Home and End without moving the item', async ({
  page,
}) => {
  await openEditor(page);
  const list = itemList(page);
  const options = list.getByRole('option');
  const total = await options.count();
  const firstRow = await options.first().innerText();
  await list.focus();

  await page.keyboard.press('ArrowDown');
  await expectSelectedOption(page, 1, 'CAB-01');
  await page.keyboard.press('ArrowDown');
  await expectSelectedOption(page, 2, 'CAB-02');
  await page.keyboard.press('ArrowUp');
  await expectSelectedOption(page, 1, 'CAB-01');
  await page.keyboard.press('End');
  await expectSelectedOption(page, total, 'UPS-02');
  await page.keyboard.press('Home');
  await expectSelectedOption(page, 1, 'CAB-01');

  await expect(list).toBeFocused();
  expect(await options.first().innerText()).toBe(firstRow);
});

test('from the item list, Tab reaches the 3D view, which keeps focus while the keyboard moves, deselects, deletes, places and cancels', async ({
  page,
}) => {
  await openEditor(page);
  const list = itemList(page);
  const view = viewportGroup(page);
  const options = list.getByRole('option');
  await list.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(view).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('textbox', { name: 'X' })).toHaveValue('3.50');
  await expect(page.getByTestId('live-region')).toContainText('CAB-01');

  await page.keyboard.press('Escape');
  await expect(list.getByRole('option', { selected: true })).toHaveCount(0);
  await expect(page.getByText('No item selected')).toBeVisible();

  const before = await options.count();
  await page.keyboard.press(']');
  await expect(list.getByRole('option', { selected: true })).toHaveCount(1);
  const deleted = await page.getByRole('textbox', { name: 'Tag' }).inputValue();
  await page.keyboard.press('Delete');
  await expect(options).toHaveCount(before - 1);
  await expect(list.getByRole('option', { name: new RegExp(`^${deleted}\\b`) })).toHaveCount(0);

  await page.keyboard.press('1');
  await expect(paletteCard(page, 'Cabinet')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(paletteCard(page, 'Cabinet')).toHaveAttribute('aria-pressed', 'false');
  await expect(options).toHaveCount(before);

  await page.keyboard.press('2');
  await expect(paletteCard(page, 'Drive')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(paletteCard(page, 'Drive')).toHaveAttribute('aria-pressed', 'false');
  await expect(options).toHaveCount(before);
  await expect(view).toBeFocused();
});

test('the shortcut dialog keeps a visible focus inside, hides the page from assistive technology and returns focus to where it was opened', async ({
  page,
}) => {
  await openEditor(page);
  const dialog = shortcutDialog(page);
  const trigger = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expectFocusInside(dialog);
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);

  expect(await tabInsideShowingFocus(page, dialog, 'Tab')).toEqual([]);
  expect(await tabInsideShowingFocus(page, dialog, 'Shift+Tab')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await viewportGroup(page).focus();
  await page.keyboard.press('Shift+Slash');
  await expect(dialog).toBeVisible();
  await expectFocusInside(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(viewportGroup(page)).toBeFocused();
});

async function setSingleKeyShortcuts(page: Page, on: boolean): Promise<void> {
  const dialog = shortcutDialog(page);
  const toggle = dialog.getByRole('switch', { name: 'Single-key shortcuts' });
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expectFocusInside(dialog);
  await page.keyboard.press('Tab', { delay: HUMAN_KEY_DELAY_MS });
  await page.keyboard.press('Tab', { delay: HUMAN_KEY_DELAY_MS });
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeChecked({ checked: !on });
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked({ checked: on });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('single-key shortcuts can be switched off and on again from the keyboard, and the choice survives a reload', async ({
  page,
}) => {
  await openEditor(page);
  const cabinet = paletteCard(page, 'Cabinet');
  const rotation0 = page.getByRole('radio', { name: '0°', exact: true });
  const x = page.getByRole('textbox', { name: 'X' });
  await setSingleKeyShortcuts(page, false);
  await expect(cabinet).not.toHaveAttribute('aria-keyshortcuts');

  await itemList(page).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(viewportGroup(page)).toBeFocused();
  await page.keyboard.press('r');
  await page.keyboard.press('1');
  await page.keyboard.press('Shift+Slash');
  await expect(rotation0).toBeChecked();
  await expect(cabinet).toHaveAttribute('aria-pressed', 'false');
  await expect(shortcutDialog(page)).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(x).toHaveValue('3.50');

  await page.reload();
  await expect(cabinet).toBeVisible();
  await expect(cabinet).not.toHaveAttribute('aria-keyshortcuts');
  await setSingleKeyShortcuts(page, true);
  await expect(cabinet).toHaveAttribute('aria-keyshortcuts', '1');
  await viewportGroup(page).focus();
  await page.keyboard.press('1');
  await expect(cabinet).toHaveAttribute('aria-pressed', 'true');
});

test('host.html keeps keyboard focus on the host page while the embedded editor connects, so the first Tab reaches the skip link', async ({
  page,
}) => {
  await openHost(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to the layout editor' })).toBeFocused();
});

test('the host.html skip link moves keyboard focus into the embedded editor', async ({ page }) => {
  await openHost(page);
  const skipLink = page.getByRole('link', { name: 'Skip to the layout editor' });
  await skipLink.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('#editor-frame')).toBeFocused();
  const editor = page.frame({ url: /embed=1/ });
  if (!editor) throw new Error('The embedded editor frame is missing');
  expect(await editor.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test('in host.html, keyboard focus stays in the embedded editor’s overlay when access expires and is renewed while Send BOM to quote has focus', async ({
  page,
}) => {
  await page.clock.install();
  const editor = await openHost(page);
  const quote = editor.getByRole('button', { name: 'Send BOM to quote' });
  await expect(quote).toBeVisible();
  await page.getByRole('checkbox', { name: 'Renew tokens automatically' }).uncheck();
  await quote.focus();

  await page.clock.fastForward('02:01');
  await expect(editor.getByRole('alert')).toContainText('Access expired.');
  await expect(editor.getByRole('alert')).toBeFocused();

  await page.evaluate((editorOrigin) => {
    const frame = document.querySelector('#editor-frame');
    if (!(frame instanceof HTMLIFrameElement)) return;
    frame.contentWindow?.postMessage(
      {
        protocol: 'cwx.layout-editor',
        version: 1,
        type: 'token',
        payload: { token: 'renewed-token-7a1c', tokenExpiresAt: Date.now() + 120_000 },
      },
      editorOrigin,
    );
  }, EDITOR_ORIGIN);
  await expect(quote).toBeFocused();
});
