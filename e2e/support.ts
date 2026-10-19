import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config.ts';

export { expect };

export const THREE_CANVAS = 'canvas[data-engine^="three.js"]';
export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const editorPage = new URL(BASE_URL);
const hostPage = new URL('/host.html', editorPage);
hostPage.hostname = '127.0.0.1';

export const EDITOR_ORIGIN = editorPage.origin;
export const HOST_ORIGIN = hostPage.origin;
export const HOST_URL = hostPage.href;

export const FIRST_RENDER_TIMEOUT_MS = 20_000;
export const HEAVY_LAYOUT_TIMEOUT_MS = 60_000;
const CAMERA_FOV_DEGREES = 40;
const SETTLE_INTERVAL_MS = 300;
const READOUT = /^X (\d+(?:\.\d+)?) m · Z (\d+(?:\.\d+)?) m$/;
const DICTIONARIES = new URL('../src/i18n/messages.ts', import.meta.url).href;
const PHRASE_BREAKS = /[|·:;,.!?()“”"…→×+\n]+/;
const PLACEHOLDER = /\{\w+\}/g;

export interface FloorPoint {
  readonly x: number;
  readonly z: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface CameraReading {
  readonly distance: number;
  readonly x: number;
  readonly z: number;
  readonly azimuth: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type FloorToScreen = (point: FloorPoint, height?: number) => ScreenPoint;

export const test = base.extend<{ consoleErrors: readonly string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(errors, 'console errors during the flow').toEqual([]);
    },
    { auto: true },
  ],
});

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The element has no layout box');
  return box;
}

export function cssOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

export function systemColour(page: Page, name: string): Promise<string> {
  return page.evaluate((colour) => {
    const probe = document.createElement('div');
    probe.style.color = colour;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
}

export async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

export async function restPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await blurFocus(page);
}

export async function waitForView(
  root: Page | FrameLocator,
  timeout = FIRST_RENDER_TIMEOUT_MS,
): Promise<Locator> {
  const canvas = root.locator(THREE_CANVAS);
  await expect(canvas).toHaveAttribute('data-camera-distance', /\d/, { timeout });
  return canvas;
}

export async function openEditor(page: Page, path = '/', timeout?: number): Promise<Locator> {
  await page.goto(path);
  return waitForView(page, timeout);
}

export async function openHost(page: Page): Promise<FrameLocator> {
  await page.goto(HOST_URL);
  await expect(page.locator('#connection-status')).toHaveAttribute('data-state', 'connected', {
    timeout: FIRST_RENDER_TIMEOUT_MS,
  });
  return page.frameLocator('#editor-frame');
}

function numberOrNaN(value: string | null): number {
  return value === null ? Number.NaN : Number(value);
}

export async function readCamera(canvas: Locator): Promise<CameraReading> {
  const [distance, target, azimuth] = await Promise.all([
    canvas.getAttribute('data-camera-distance'),
    canvas.getAttribute('data-camera-target'),
    canvas.getAttribute('data-camera-azimuth'),
  ]);
  const [x = Number.NaN, z = Number.NaN] = (target ?? '').split(' ').map(Number);
  return { distance: numberOrNaN(distance), x, z, azimuth: numberOrNaN(azimuth) };
}

function sameReading(a: CameraReading, b: CameraReading): boolean {
  return a.distance === b.distance && a.x === b.x && a.z === b.z && a.azimuth === b.azimuth;
}

export async function settledCamera(
  canvas: Locator,
  changedFrom?: CameraReading,
): Promise<CameraReading> {
  const readings: CameraReading[] = [];
  await expect
    .poll(
      async () => {
        readings.push(await readCamera(canvas));
        const [previous, latest] = readings.slice(-2);
        return (
          previous !== undefined &&
          latest !== undefined &&
          sameReading(previous, latest) &&
          Number.isFinite(latest.distance) &&
          !(changedFrom !== undefined && sameReading(changedFrom, latest))
        );
      },
      { intervals: [SETTLE_INTERVAL_MS], message: 'the camera comes to rest after moving' },
    )
    .toBe(true);
  const settled = readings.at(-1);
  if (!settled) throw new Error('The camera was never read');
  return settled;
}

export async function pointInView(canvas: Locator, fx: number, fy: number): Promise<ScreenPoint> {
  const box = await boxOf(canvas);
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

export function cursorReadout(page: Page): Locator {
  return page.getByTitle('Pointer position on the floor');
}

export function readoutText(point: FloorPoint): string {
  return `X ${point.x.toFixed(2)} m · Z ${point.z.toFixed(2)} m`;
}

export async function floorUnderPointer(
  page: Page,
  canvas: Locator,
  at: ScreenPoint,
): Promise<FloorPoint> {
  const box = await boxOf(canvas);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 40);
  await expect(cursorReadout(page)).not.toHaveText(READOUT);
  await page.mouse.move(at.x, at.y);
  await expect(cursorReadout(page)).toHaveText(READOUT);
  const match = READOUT.exec(await cursorReadout(page).innerText());
  if (!match) throw new Error('The pointer readout lost its value');
  return { x: Number(match[1]), z: Number(match[2]) };
}

export async function switchToTopView(page: Page, canvas: Locator): Promise<FloorToScreen> {
  const before = await settledCamera(canvas);
  const top = page.getByRole('radio', { name: 'Top' });
  await top.click();
  await expect(top).toBeChecked();
  const camera = await settledCamera(canvas, before);
  const box = await boxOf(canvas);
  const focal = box.height / 2 / Math.tan(((CAMERA_FOV_DEGREES / 2) * Math.PI) / 180);
  const toScreen: FloorToScreen = (point, height = 0) => {
    const scale = focal / (camera.distance - height);
    return {
      x: box.x + box.width / 2 + (point.x - camera.x) * scale,
      y: box.y + box.height / 2 + (point.z - camera.z) * scale,
    };
  };
  for (const probe of [
    { x: 1, z: 1 },
    { x: 19, z: 11 },
  ]) {
    const at = toScreen(probe);
    await page.mouse.move(at.x, at.y);
    await expect(cursorReadout(page), 'the top view maps the floor to the screen').toHaveText(
      readoutText(probe),
    );
  }
  return toScreen;
}

export function itemList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Placed items' });
}

export function listRow(page: Page, tag: string): Locator {
  return itemList(page).getByRole('option', { name: new RegExp(`^${tag} `) });
}

export function selectedRows(page: Page): Locator {
  return itemList(page).getByRole('option', { selected: true });
}

export function rowPosition(point: FloorPoint): string {
  return `X ${point.x.toFixed(2)} · Z ${point.z.toFixed(2)}`;
}

export async function positionInRow(row: Locator): Promise<FloorPoint> {
  const match = /X (\d+\.\d+) · Z (\d+\.\d+)/.exec(await row.innerText());
  if (!match) throw new Error('The list row shows no position');
  return { x: Number(match[1]), z: Number(match[2]) };
}

export function paletteCard(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'Equipment' }).getByRole('button', { name, exact: true });
}

export function undoButton(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Edit tools' }).getByRole('button', { name: /^Undo/ });
}

export function redoButton(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Edit tools' }).getByRole('button', { name: /^Redo/ });
}

export function statusBar(page: Page): Locator {
  return page.getByRole('contentinfo', { name: 'Status' });
}

export function liveRegion(page: Page): Locator {
  return page.getByTestId('live-region');
}

export function propertiesPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Properties' });
}

export function rotationChoice(page: Page, degrees: number): Locator {
  return propertiesPanel(page)
    .getByRole('radiogroup', { name: 'Rotation' })
    .getByRole('radio', { name: `${degrees}°`, exact: true });
}

export function placementBanner(page: Page, kindName: string): Locator {
  return page.getByRole('main').getByText(`Placing: ${kindName}`, { exact: true });
}

export function viewportGroup(page: Page): Locator {
  return page.getByRole('group', { name: '3D layout view' });
}

export function selectionLabel(page: Page, tag: string): Locator {
  return page.getByRole('main').getByText(tag, { exact: true });
}

export function shortcutDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Keyboard shortcuts' });
}

export function performanceOverlay(page: Page): Locator {
  return page.getByRole('region', { name: 'Performance' });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function hudText(page: Page, label: string): Promise<string> {
  const value = performanceOverlay(page)
    .locator('dt')
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .locator('xpath=following-sibling::dd[1]');
  return (await value.innerText()).trim();
}

export async function hudNumber(page: Page, label: string): Promise<number> {
  return Number((await hudText(page, label)).replace(/\D/g, ''));
}

export async function seriousAxeViolations(page: Page): Promise<readonly string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  return violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .flatMap(({ id, impact, nodes }) =>
      nodes.map(({ target }) => `${impact ?? ''} ${id}: ${target.join(' >> ')}`),
    );
}

type Dictionary = Readonly<Record<string, string>>;

function isDictionary(value: unknown): value is Dictionary {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

export async function englishOnlyPhrases(): Promise<readonly string[]> {
  const module: unknown = await import(DICTIONARIES);
  const messages =
    typeof module === 'object' && module !== null && 'messages' in module ? module.messages : null;
  const en = typeof messages === 'object' && messages !== null && 'en' in messages && messages.en;
  const vi = typeof messages === 'object' && messages !== null && 'vi' in messages && messages.vi;
  if (!isDictionary(en) || !isDictionary(vi)) {
    throw new Error(`The editor dictionaries could not be read from ${DICTIONARIES}`);
  }
  const vietnamese = Object.values(vi).join('\n');
  const phrases = Object.entries(en)
    .filter(([key, text]) => vi[key] !== text)
    .flatMap(([, text]) =>
      text
        .replace(PLACEHOLDER, '|')
        .split(PHRASE_BREAKS)
        .map((part) => part.trim())
        .filter((part) => /\p{L}{3}/u.test(part)),
    )
    .filter((phrase) => !containsPhrase(vietnamese, phrase));
  return [...new Set(phrases)];
}

export async function englishOnScreen(
  page: Page,
  phrases: readonly string[],
): Promise<readonly string[]> {
  const text = await page.evaluate(() => {
    const attributes = ['aria-label', 'title', 'placeholder', 'aria-roledescription', 'alt'];
    const labelled = [...document.body.querySelectorAll('*')]
      .filter((element) => element.checkVisibility())
      .flatMap((element) =>
        attributes.map((name) => element.getAttribute(name)).filter((value) => value !== null),
      );
    return [document.body.innerText, ...labelled].join('\n');
  });
  return phrases.filter((phrase) => containsPhrase(text, phrase));
}

export interface EditorState {
  readonly name: string;
  readonly enter: (page: Page) => Promise<void>;
}

export const EDITOR_STATES: readonly EditorState[] = [
  { name: 'default view', enter: () => Promise.resolve() },
  {
    name: 'item selected',
    enter: async (page) => {
      await listRow(page, 'CAB-01').click();
      await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveValue('CAB-01');
    },
  },
  {
    name: 'Assistant tab with a proposal',
    enter: async (page) => {
      await page.getByRole('tab', { name: 'Assistant' }).click();
      await page.getByRole('button', { name: 'Fix clearance issues' }).click();
      await expect(page.getByRole('button', { name: 'Accept' })).toBeEnabled();
    },
  },
  {
    name: 'shortcut dialog open',
    enter: async (page) => {
      await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      await expect(shortcutDialog(page)).toBeVisible();
    },
  },
  {
    name: 'shortcut dialog with single-key shortcuts off',
    enter: async (page) => {
      await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      const toggle = shortcutDialog(page).getByRole('switch', { name: 'Single-key shortcuts' });
      await toggle.click();
      await expect(toggle).not.toBeChecked();
    },
  },
  {
    name: 'draft-restored toast',
    enter: async (page) => {
      await itemList(page).focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Delete');
      await expect(page.getByRole('contentinfo')).toContainText('Saved');
      await page.reload();
      const notice = page.getByText('Restored your last draft.');
      await expect(notice).toBeVisible();
      await expect(page.locator('[data-sonner-toast]', { has: notice })).toHaveCSS('opacity', '1');
    },
  },
  {
    name: 'Vietnamese',
    enter: async (page) => {
      await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trình bố trí thiết bị');
    },
  },
  {
    name: 'placement mode',
    enter: async (page) => {
      await paletteCard(page, 'Cabinet').click();
      await expect(paletteCard(page, 'Cabinet')).toHaveAttribute('aria-pressed', 'true');
    },
  },
  {
    name: 'narrow window (800 px)',
    enter: async (page) => {
      await page.setViewportSize({ width: 800, height: 1000 });
      await expect(itemList(page)).toBeVisible();
    },
  },
];
