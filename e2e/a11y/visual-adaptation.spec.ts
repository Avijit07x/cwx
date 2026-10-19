import type { Locator, Page } from '@playwright/test';
import {
  blurFocus,
  cssOf,
  expect,
  itemList,
  listRow,
  openEditor,
  openHost,
  paletteCard,
  restPointer,
  seriousAxeViolations,
  shortcutDialog,
  systemColour,
  test,
  waitForView,
} from '../support.ts';

const MIN_STATE_CONTRAST = 3;
const LIST_ROW_PX = 44;
const RING_ROOM_PX = 4;
const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

async function switchToVietnamese(page: Page): Promise<void> {
  await page.getByRole('banner').getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}

function sidewaysOverflow(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scrollers = [
      root,
      ...document.querySelectorAll('header, aside, main, footer, [role="tabpanel"], [role="log"]'),
    ];
    return scrollers
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') ?? ''} is ${element.scrollWidth} px wide in ${element.clientWidth} px`,
      );
  });
}

async function looksDifferent(
  page: Page,
  shoot: () => Promise<Buffer>,
  change: () => Promise<void>,
): Promise<boolean> {
  await restPointer(page);
  const before = await shoot();
  await change();
  await restPointer(page);
  const after = await shoot();
  return !before.equals(after);
}

interface StateChange {
  readonly name: string;
  readonly visible: boolean;
}

async function rowsClip(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const first = await itemList(page)
    .getByRole('option', { name: /^CAB-01 / })
    .boundingBox();
  const second = await itemList(page)
    .getByRole('option', { name: /^CAB-02 / })
    .boundingBox();
  if (!first || !second) throw new Error('The first two list rows are not laid out');
  const x = Math.max(0, first.x - RING_ROOM_PX);
  return {
    x,
    y: first.y,
    width: first.x + first.width + RING_ROOM_PX - x,
    height: second.y + second.height - first.y,
  };
}

async function stateChanges(page: Page): Promise<readonly StateChange[]> {
  const list = itemList(page);
  const shotOf = (locator: Locator) => () => locator.screenshot({ animations: 'disabled' });
  const changes: StateChange[] = [];

  await list.getByRole('option', { name: /^CAB-01 / }).click();
  const clip = await rowsClip(page);
  changes.push({
    name: 'the selected row of the item list',
    visible: await looksDifferent(
      page,
      () => page.screenshot({ clip, animations: 'disabled' }),
      async () => {
        await list.getByRole('option', { name: /^CAB-02 / }).click();
        await expect(list.getByRole('option', { name: /^CAB-02 / })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      },
    ),
  });

  await page.getByRole('searchbox', { name: 'Filter placed items' }).focus();
  await page.keyboard.press('Tab');
  await expect(list).toBeFocused();
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  await blurFocus(page);
  const blurred = await page.screenshot({ clip, animations: 'disabled' });
  changes.push({ name: 'the keyboard focus on the item list', visible: !focused.equals(blurred) });

  const rotation = page.getByRole('radiogroup', { name: 'Rotation' });
  changes.push({
    name: 'the checked option of the Rotation radio group',
    visible: await looksDifferent(page, shotOf(rotation), async () => {
      await rotation.getByRole('radio', { name: '90°' }).click();
      await expect(rotation.getByRole('radio', { name: '90°' })).toBeChecked();
    }),
  });

  const cameraView = page.getByRole('radiogroup', { name: 'Camera view' });
  changes.push({
    name: 'the checked option of the Camera view radio group',
    visible: await looksDifferent(page, shotOf(cameraView), async () => {
      await cameraView.getByRole('radio', { name: 'Top' }).click();
      await expect(cameraView.getByRole('radio', { name: 'Top' })).toBeChecked();
    }),
  });

  const cabinet = paletteCard(page, 'Cabinet');
  changes.push({
    name: 'the pressed palette card',
    visible: await looksDifferent(page, shotOf(cabinet.locator('..')), async () => {
      await cabinet.click();
      await expect(cabinet).toHaveAttribute('aria-pressed', 'true');
    }),
  });
  await page.keyboard.press('Escape');
  return changes;
}

function invisible(changes: readonly StateChange[]): readonly string[] {
  return changes.filter(({ visible }) => !visible).map(({ name }) => name);
}

test.describe('in forced-colours mode (Windows high contrast)', () => {
  test.use({ forcedColors: 'active', colorScheme: 'dark' });

  test('the selected list row, the list focus, the checked radio options and the pressed palette card stay visible', async ({
    page,
  }) => {
    await openEditor(page);
    expect(invisible(await stateChanges(page)), 'states that look the same either way').toEqual([]);
  });

  test('the pressed palette card and the pressed Assistant toggle are marked with Highlight', async ({
    page,
  }) => {
    await page.goto('/');
    const cabinet = paletteCard(page, 'Cabinet');
    await expect(cabinet).toBeVisible();
    const highlight = await systemColour(page, 'Highlight');
    const highlightText = await systemColour(page, 'HighlightText');

    await cabinet.click();
    await expect(cabinet).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    await expect
      .poll(() => cssOf(cabinet.locator('..'), 'border-top-color'), {
        message: 'pressed card border',
      })
      .toBe(highlight);
    await page.keyboard.press('Escape');

    const toggle = page.getByRole('banner').getByRole('button', { name: 'Assistant' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    await expect
      .poll(() => cssOf(toggle, 'background-color'), { message: 'pressed toggle fill' })
      .toBe(highlight);
    await expect
      .poll(() => cssOf(toggle, 'color'), { message: 'pressed toggle label' })
      .toBe(highlightText);
    expect(
      await cssOf(toggle, 'forced-color-adjust'),
      'the label is drawn without the Canvas backplate that would hide it',
    ).toBe('none');
  });

  test('the Highlight marker follows the selected row of the item list, and keyboard focus on the list draws a solid ring that stands out from the Canvas', async ({
    page,
  }) => {
    await openEditor(page);
    const highlight = await systemColour(page, 'Highlight');
    const canvas = await systemColour(page, 'Canvas');
    const first = listRow(page, 'CAB-01');
    const second = listRow(page, 'CAB-02');

    await first.click();
    await expect
      .poll(() => cssOf(first, 'border-left-color'), { message: 'selected row marker' })
      .toBe(highlight);
    await second.click();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => cssOf(second, 'border-left-color'), {
        message: 'the marker moves with the selection',
      })
      .toBe(highlight);
    expect(await cssOf(first, 'border-left-color'), 'the row left behind').not.toBe(highlight);

    await restPointer(page);
    expect(await cssOf(second, 'outline-style'), 'the selected row without focus').toBe('none');
    await page.getByRole('searchbox', { name: 'Filter placed items' }).focus();
    await page.keyboard.press('Tab');
    await expect(itemList(page)).toBeFocused();
    await expect
      .poll(() => cssOf(second, 'outline-style'), { message: 'keyboard focus ring' })
      .toBe('solid');
    expect(await cssOf(second, 'outline-color'), 'focus ring against the Canvas').not.toBe(canvas);
  });

  test('a pressed toggle button looks different from a released one', async ({ page }) => {
    await openEditor(page);
    const highlight = await systemColour(page, 'Highlight');
    const highlightText = await systemColour(page, 'HighlightText');
    const stats = page.getByRole('button', { name: 'Performance statistics' });
    await expect(stats).toHaveAttribute('aria-pressed', 'false');
    expect(await cssOf(stats, 'background-color'), 'released toggle fill').not.toBe(highlight);

    await stats.focus();
    await page.keyboard.press('Enter');
    await expect(stats).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => cssOf(stats, 'background-color'), { message: 'pressed toggle fill' })
      .toBe(highlight);
    await expect
      .poll(() => cssOf(stats, 'color'), { message: 'pressed toggle icon' })
      .toBe(highlightText);
  });
});

test('without forced colours the same state changes are visible, so the forced-colours check can see them', async ({
  page,
}) => {
  await openEditor(page);
  expect(invisible(await stateChanges(page))).toEqual([]);
});

function checkedOptionContrast(group: Locator): Promise<number> {
  return group.evaluate((node) => {
    const rgba = (color: string): readonly [number, number, number, number] => {
      const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const over = (
      top: readonly [number, number, number, number],
      base: readonly [number, number, number, number],
    ): readonly [number, number, number, number] => [
      top[0] * top[3] + base[0] * (1 - top[3]),
      top[1] * top[3] + base[1] * (1 - top[3]),
      top[2] * top[3] + base[2] * (1 - top[3]),
      1,
    ];
    const luminance = ([r, g, b]: readonly [number, number, number, number]): number => {
      const linear = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (
      a: readonly [number, number, number, number],
      b: readonly [number, number, number, number],
    ) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((p, q) => q - p);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    };
    const checked = node.querySelector('[role="radio"][aria-checked="true"]');
    if (!checked) return 0;
    const groupBackground = rgba(getComputedStyle(node).backgroundColor);
    const style = getComputedStyle(checked);
    const indicators = [style.backgroundColor];
    if (Number.parseFloat(style.borderTopWidth) >= 1) indicators.push(style.borderTopColor);
    if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 1) {
      indicators.push(style.outlineColor);
    }
    const crispRing = /(rgba?\([^)]*\))\s+-?[\d.]+px\s+-?[\d.]+px\s+([\d.]+)px\s+([\d.]+)px/g;
    for (const [, color = '', blur = '0', spread = '0'] of style.boxShadow.matchAll(crispRing)) {
      if (Number(spread) >= 1 && Number(blur) <= 1) indicators.push(color);
    }
    return Math.max(
      ...indicators.map((color) => ratio(over(rgba(color), groupBackground), groupBackground)),
    );
  });
}

test('the checked option of each segmented radio group stands out from the group by at least 3:1 through its fill, border, outline or ring (WCAG 1.4.11)', async ({
  page,
}) => {
  await openEditor(page);
  await itemList(page)
    .getByRole('option', { name: /^CAB-01 / })
    .click();
  for (const name of ['Language', 'Camera view', 'Rotation']) {
    const contrast = await checkedOptionContrast(page.getByRole('radiogroup', { name }));
    expect
      .soft(contrast, `${name}: the checked option against the group background`)
      .toBeGreaterThanOrEqual(MIN_STATE_CONTRAST);
  }
});

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1200, height: 800 },
  { width: 900, height: 1000 },
  { width: 640, height: 900 },
  { width: 360, height: 740 },
  { width: 320, height: 640 },
  { width: 320, height: 256 },
] as const;

for (const size of SIZES) {
  test.describe(`${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test(`at ${size.width} × ${size.height}, in English and Vietnamese, no region is wider than its box and axe finds no serious WCAG 2.2 AA violation`, async ({
      page,
    }) => {
      await openEditor(page);
      for (const locale of ['en', 'vi'] as const) {
        if (locale === 'vi') await switchToVietnamese(page);
        expect
          .soft(await sidewaysOverflow(page), `${locale}: content cut off or scrolling sideways`)
          .toEqual([]);
        expect.soft(await seriousAxeViolations(page), `${locale}: axe`).toEqual([]);
      }
    });
  });
}

test.describe('at 400 % zoom of a 1280 × 1024 screen (320 × 256 CSS px)', () => {
  test.use({ viewport: { width: 320, height: 256 }, deviceScaleFactor: 4 });

  test('the shortcut dialog keeps every line of text on screen or in an area the user can scroll', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    const dialog = shortcutDialog(page);
    await expect(dialog).toBeVisible();
    const unreachable = await dialog.evaluate((root) => {
      const frame = root.getBoundingClientRect();
      const lost: string[] = [];
      for (const element of root.querySelectorAll('*')) {
        const hasText = [...element.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
        );
        if (!hasText || element.closest('.sr-only')) continue;
        const box = element.getBoundingClientRect();
        if (box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1) continue;
        let scrollable = false;
        for (
          let parent = element.parentElement;
          parent !== null && root.contains(parent);
          parent = parent.parentElement
        ) {
          const { overflowY } = getComputedStyle(parent);
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            parent.scrollHeight > parent.clientHeight
          ) {
            scrollable = true;
            break;
          }
        }
        if (!scrollable) {
          lost.push(
            `"${element.textContent.trim().slice(0, 48)}" ends ${Math.round(box.bottom - frame.bottom)} px below the dialog`,
          );
        }
      }
      return lost;
    });
    expect(unreachable, 'text cut off by the dialog with no way to scroll to it').toEqual([]);
  });
});

test.describe('embedded in host.html at 1366 × 768, a common corporate laptop screen', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the embedded editor shows at least two rows of the Placed items list', async ({ page }) => {
    const editor = await openHost(page);
    await waitForView(editor);
    const list = editor.getByRole('listbox', { name: 'Placed items' });
    await expect(list).toBeVisible();
    expect(
      await list.evaluate((node) => node.clientHeight),
      'list height in px (one row is 44 px)',
    ).toBeGreaterThanOrEqual(2 * LIST_ROW_PX);
  });
});

function clippedText(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const row of document.querySelectorAll('[role="option"]')) {
      const box = row.getBoundingClientRect();
      for (const part of row.children) {
        const inner = part.getBoundingClientRect();
        if (inner.top < box.top - 0.5 || inner.bottom > box.bottom + 0.5) {
          problems.push(`list row "${row.textContent.slice(0, 16)}" spills "${part.textContent}"`);
        }
      }
    }
    for (const element of document.querySelectorAll('body *')) {
      if (!element.checkVisibility() || element.closest('.sr-only')) continue;
      const hasText = [...element.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
      );
      if (!hasText) continue;
      const style = getComputedStyle(element);
      const clips = [style.overflowX, style.overflowY].some(
        (value) => value === 'hidden' || value === 'clip',
      );
      if (
        clips &&
        style.textOverflow !== 'ellipsis' &&
        element.scrollHeight > element.clientHeight + 1
      ) {
        problems.push(`"${element.textContent.trim().slice(0, 32)}" is cut off`);
      }
    }
    return problems;
  });
}

for (const locale of ['en', 'vi'] as const) {
  test(`WCAG 1.4.12 text spacing neither cuts off nor overlaps text in the panels (${locale})`, async ({
    page,
  }) => {
    await openEditor(page);
    await itemList(page)
      .getByRole('option', { name: /^TR-01 / })
      .click();
    if (locale === 'vi') await switchToVietnamese(page);
    await page.addStyleTag({ content: TEXT_SPACING });
    expect(await clippedText(page)).toEqual([]);
  });
}

async function recordMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const longest = (durations: string): number =>
      Math.max(
        0,
        ...durations.split(',').map((value) => {
          const amount = Number.parseFloat(value);
          return value.trim().endsWith('ms') ? amount : amount * 1000;
        }),
      );
    const record = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const style = getComputedStyle(event.target);
      const duration =
        event.type === 'animationstart'
          ? longest(style.animationDuration)
          : longest(style.transitionDuration);
      const root = document.documentElement;
      root.dataset.motion = `${root.dataset.motion ?? ''}${duration};`;
    };
    document.addEventListener('animationstart', record, true);
    document.addEventListener('transitionrun', record, true);
  });
}

async function motionDurations(page: Page): Promise<readonly number[]> {
  const log = await page.evaluate(() => document.documentElement.dataset.motion ?? '');
  return log
    .split(';')
    .filter((entry) => entry !== '')
    .map(Number);
}

async function animateToastDialogAndAssistant(page: Page): Promise<void> {
  await openEditor(page);
  await itemList(page).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('contentinfo')).toContainText('Saved');
  await page.reload();
  await expect(page.getByText('Restored your last draft.')).toBeVisible();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(shortcutDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(shortcutDialog(page)).toBeHidden();
  await page.getByRole('tab', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'Summarise the layout' }).click();
  await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'false');
}

test.describe('with prefers-reduced-motion: reduce', () => {
  test.use({ reducedMotion: 'reduce' });

  test('toasts, the shortcut dialog and the assistant run no CSS transition or animation longer than 0.01 ms', async ({
    page,
  }) => {
    await recordMotion(page);
    await animateToastDialogAndAssistant(page);
    const durations = await motionDurations(page);
    expect(durations.length, 'transitions and animations were seen').toBeGreaterThan(5);
    expect(Math.max(...durations)).toBeLessThanOrEqual(0.01);
  });
});

test('without a reduced-motion preference the same interface animates, so the reduced-motion check can see it', async ({
  page,
}) => {
  await recordMotion(page);
  await animateToastDialogAndAssistant(page);
  expect(Math.max(...(await motionDurations(page)))).toBeGreaterThan(100);
});
