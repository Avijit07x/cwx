import type { Locator, Page } from '@playwright/test';
import { boxOf, expect, openEditor, openHost, test, viewportGroup } from '../support.ts';

interface Cover {
  readonly uncovered: number;
  readonly centreCovered: boolean;
}

const LOCALES = [
  {
    locale: 'en',
    view: '3D layout view',
    controls: 'View controls',
    placing: 'Placing: Variable frequency drive',
    palette: 'Equipment',
    card: 'Drive',
    sticky: 'Keeps placing until you press Esc',
  },
  {
    locale: 'vi',
    view: 'Chế độ xem bố trí 3D',
    controls: 'Điều khiển góc nhìn',
    placing: 'Đang đặt: Biến tần',
    palette: 'Thiết bị',
    card: 'Biến tần',
    sticky: 'Tiếp tục đặt cho đến khi bạn nhấn Esc',
  },
] as const;

const NARROW = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
] as const;

const GRID_PX = 4;

const TABLE_NAME = {
  en: /^Equipment counted from the layout/,
  vi: /^Thiết bị được đếm từ bố trí/,
} as const;

type Locale = keyof typeof TABLE_NAME;

interface Layout {
  readonly embedded: boolean;
  readonly width: number;
  readonly height: number;
  readonly locale: Locale;
}

const LAYOUTS: readonly Layout[] = [
  { embedded: true, width: 1366, height: 768, locale: 'en' },
  { embedded: true, width: 1366, height: 768, locale: 'vi' },
  { embedded: true, width: 1440, height: 900, locale: 'en' },
  { embedded: true, width: 1536, height: 864, locale: 'en' },
  { embedded: false, width: 1024, height: 768, locale: 'en' },
  { embedded: false, width: 375, height: 812, locale: 'en' },
];

function coverOf(view: Locator): Promise<Cover> {
  return view.evaluate((root, step) => {
    const canvas = root.querySelector('canvas');
    const panels = [...root.querySelectorAll('*')]
      .filter(
        (node) =>
          !node.contains(canvas) &&
          node.checkVisibility() &&
          getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)',
      )
      .map((node) => node.getBoundingClientRect());
    const covered = (x: number, y: number) =>
      panels.some(
        (panel) => x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom,
      );
    const area = root.getBoundingClientRect();
    let open = 0;
    let total = 0;
    for (let y = area.top + step / 2; y < area.bottom; y += step) {
      for (let x = area.left + step / 2; x < area.right; x += step) {
        total += 1;
        if (!covered(x, y)) open += 1;
      }
    }
    return {
      uncovered: open / total,
      centreCovered: covered(area.left + area.width / 2, area.top + area.height / 2),
    };
  }, GRID_PX);
}

async function expectPreviewInSight(view: Locator, how: string): Promise<void> {
  const cover = await coverOf(view);
  expect
    .soft(
      cover.centreCovered,
      `${how}: the middle of the view, where the camera looks and the preview starts, is under no panel`,
    )
    .toBe(false);
  expect
    .soft(cover.uncovered, `${how}: share of the 3D view under no panel`)
    .toBeGreaterThanOrEqual(0.5);
}

async function openIn(page: Page, locale: Locale): Promise<void> {
  if (locale === 'vi') {
    await page.addInitScript(() => {
      window.localStorage.setItem('layout-editor:v1:locale', 'vi');
    });
  }
  await openEditor(page);
}

async function bomTable(page: Page, { embedded, locale }: Layout): Promise<Locator> {
  if (!embedded) {
    await page.goto('/');
    return page.getByRole('region', { name: TABLE_NAME[locale] });
  }
  const editor = await openHost(page);
  await page.locator('#locale-select').selectOption(locale);
  return editor.getByRole('region', { name: TABLE_NAME[locale] });
}

test('at 320 px the top bar shows the whole project name in its own row, in English and Vietnamese', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const banner = page.getByRole('banner');
  await expect(banner).toBeVisible();
  for (const locale of ['en', 'vi'] as const) {
    if (locale === 'vi') await banner.getByRole('radio', { name: 'Tiếng Việt' }).click();
    const project = banner.getByText(/^(Project|Dự án): /).locator('..');
    const { shown, full } = await project.evaluate((node) => ({
      shown: node.clientWidth,
      full: node.scrollWidth,
    }));
    expect(shown, `${locale}: width of the project name in px`).toBeGreaterThanOrEqual(80);
    expect(full, `${locale}: the project name is not cut short`).toBeLessThanOrEqual(shown);
    expect(
      await banner.evaluate((node) => node.scrollHeight <= node.clientHeight),
      `${locale}: the two rows fit in the top bar, so nothing overlaps the panels below`,
    ).toBe(true);
  }
});

for (const size of NARROW) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    for (const text of LOCALES) {
      test(`(${text.locale}) the view controls keep to one row, and while placing, the spot where the preview starts and at least half of the 3D view stay uncovered`, async ({
        page,
      }) => {
        await openIn(page, text.locale);
        const view = page.getByRole('group', { name: text.view, exact: true });
        const controls = view.getByRole('group', { name: text.controls, exact: true });
        const button = await boxOf(controls.getByRole('button').first());
        expect
          .soft((await boxOf(controls)).height, 'the view controls take one row')
          .toBeLessThan(2 * button.height);

        await view.focus();
        await page.keyboard.press('2');
        await expect(view.getByText(text.placing, { exact: true })).toBeVisible();
        await expectPreviewInSight(view, 'placing with the 2 key');

        await page.keyboard.press('Escape');
        await page
          .getByRole('region', { name: text.palette })
          .getByRole('button', { name: text.card, exact: true })
          .click({ modifiers: ['Shift'] });
        await expect(view.getByText(text.sticky, { exact: true })).toBeAttached();
        await expectPreviewInSight(view, 'placing repeatedly after Shift + click');
      });
    }
  });
}

test.describe('at 1366 × 768, where the 3D view is wider than 480 px', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the placement banner keeps every key hint and the legend stays on screen', async ({
    page,
  }) => {
    await openEditor(page);
    const view = viewportGroup(page);
    await view.focus();
    await page.keyboard.press('2');
    const banner = view
      .getByText('Placing: Variable frequency drive', { exact: true })
      .locator('..');
    await expect(banner.locator('kbd').filter({ visible: true })).toHaveText([
      'Enter',
      'Shift',
      'R',
      'Esc',
    ]);
    await expect(view.getByRole('region', { name: 'Legend' })).toBeVisible();
  });
});

for (const layout of LAYOUTS) {
  const where = layout.embedded ? 'embedded in the host page' : 'in the editor';
  test(`the BOM shows quantities and line totals ${where} at ${String(layout.width)} × ${String(layout.height)} (${layout.locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    const scroller = await bomTable(page, layout);
    await expect(scroller).toBeVisible();
    const columns = await scroller.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const shown = (cell: Element) => cell.getBoundingClientRect().width > 0;
      const centre = (cell: Element) => {
        const rect = cell.getBoundingClientRect();
        return rect.left + rect.width / 2;
      };
      const headers = [...element.querySelectorAll('thead th')].filter(shown);
      const totals = [...element.querySelectorAll('tfoot td')].filter(shown);
      return {
        clipped: headers
          .filter((header) => {
            const rect = header.getBoundingClientRect();
            return rect.left < box.left - 0.5 || rect.right > box.right + 0.5;
          })
          .map((header) => header.textContent),
        offsets: totals.slice(-2).map((cell, index) => {
          const header = headers.at(index - 2);
          return header ? Math.round(Math.abs(centre(cell) - centre(header))) : Number.NaN;
        }),
      };
    });
    expect(columns.clipped).toEqual([]);
    expect(columns.offsets).toEqual([0, 0]);
  });
}
