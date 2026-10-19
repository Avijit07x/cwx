import type { Locator, Page } from '@playwright/test';
import {
  expect,
  itemList,
  listRow,
  liveRegion,
  openEditor,
  paletteCard,
  shortcutDialog,
  test,
  undoButton,
  viewportGroup,
} from '../support.ts';

const BOM_REGION = 'Equipment counted from the layout, with part numbers and prices';
const CAB_01_HOME = 'X 3.00 · Z 1.25';

function focusIsOnThePage(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.activeElement !== null && document.activeElement !== document.body,
  );
}

test('a keyboard user who starts placing from a palette card places the item with Enter, as the announcement tells them', async ({
  page,
}) => {
  await openEditor(page);
  const cabinet = paletteCard(page, 'Cabinet');
  const rows = itemList(page).getByRole('option');
  const before = await rows.count();
  await cabinet.focus();
  await page.keyboard.press('Enter');
  await expect(cabinet).toHaveAttribute('aria-pressed', 'true');
  await expect(liveRegion(page)).toContainText('press Enter to place it');
  await page.keyboard.press('ArrowRight');
  await expect(liveRegion(page)).toHaveText(/^X \d+\.\d{2} m, Z \d+\.\d{2} m\.$/);

  await page.keyboard.press('Enter');
  await expect(rows, 'Enter places a new cabinet').toHaveCount(before + 1);
  await expect(liveRegion(page)).toContainText('Placed CAB-05');
});

test('with focus in the item list, the arrow keys and Enter that the placement announcement names move and place the preview', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'CAB-02').click();
  await expect(itemList(page)).toBeFocused();
  await page.keyboard.press('1');
  await expect(liveRegion(page)).toContainText(
    'Move it with the mouse or the arrow keys, press Enter to place it',
  );
  await page.keyboard.press('ArrowDown');
  await expect(
    listRow(page, 'CAB-02'),
    'ArrowDown moves the preview, not the selection',
  ).toHaveAttribute('aria-selected', 'true');
  await expect(liveRegion(page)).toHaveText(/^X \d+\.\d{2} m, Z \d+\.\d{2} m\.$/);
  await page.keyboard.press('Enter');
  await expect(listRow(page, 'CAB-05'), 'Enter places the cabinet').toHaveCount(1);
  await expect(paletteCard(page, 'Cabinet')).toHaveAttribute('aria-pressed', 'false');
});

interface ScrollRegionCase {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly key: 'ArrowDown' | 'ArrowRight';
  readonly region: (page: Page) => Locator;
  readonly scrolled: (region: Locator) => Promise<number>;
}

const SCROLL_REGIONS: readonly ScrollRegionCase[] = [
  {
    name: 'the bill of materials at 1366 × 768',
    viewport: { width: 1366, height: 768 },
    key: 'ArrowDown',
    region: (page) => page.getByRole('region', { name: BOM_REGION }),
    scrolled: (region) => region.evaluate((node) => node.scrollTop),
  },
  {
    name: 'the bill of materials at 400 % zoom (320 × 256), sideways',
    viewport: { width: 320, height: 256 },
    key: 'ArrowRight',
    region: (page) => page.getByRole('region', { name: BOM_REGION }),
    scrolled: (region) => region.evaluate((node) => node.scrollLeft),
  },
  {
    name: 'the Inspect panel at 1366 × 768',
    viewport: { width: 1366, height: 768 },
    key: 'ArrowDown',
    region: (page) => page.getByRole('tabpanel', { name: 'Inspect' }),
    scrolled: (region) => region.evaluate((node) => node.scrollTop),
  },
];

for (const scrollCase of SCROLL_REGIONS) {
  test.describe(scrollCase.name, () => {
    test.use({ viewport: scrollCase.viewport });

    test(`an arrow key in the focused scroll region scrolls it and leaves the selected item where it is: ${scrollCase.name}`, async ({
      page,
    }) => {
      await openEditor(page);
      const cabinet = listRow(page, 'CAB-01');
      await cabinet.click();
      await expect(cabinet).toContainText(CAB_01_HOME);
      const region = scrollCase.region(page);
      await expect
        .poll(
          () =>
            region.evaluate(
              (node) =>
                node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth,
            ),
          { message: 'the region has something to scroll' },
        )
        .toBe(true);
      await region.focus();
      await expect(region).toBeFocused();

      await page.keyboard.press(scrollCase.key);
      await expect
        .soft(cabinet, 'the selected cabinet does not move while the user scrolls a panel')
        .toContainText(CAB_01_HOME);
      await expect.soft(undoButton(page), 'scrolling records no edit').toBeDisabled();
      await expect.soft
        .poll(() => scrollCase.scrolled(region), { message: 'the arrow key scrolls the region' })
        .toBeGreaterThan(0);
    });
  });
}

test('arrow keys in the focused bill-of-materials table leave the selected item where it is', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'CAB-01').click();
  const table = page.getByRole('region', { name: BOM_REGION });
  await table.focus();
  await expect(table).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(listRow(page, 'CAB-01'), 'scrolling the table must not move CAB-01').toContainText(
    CAB_01_HOME,
  );
  await expect(undoButton(page)).toBeDisabled();
});

interface DeletionCase {
  readonly name: string;
  readonly path: string;
  readonly focusTarget: (page: Page) => Promise<Locator>;
}

const DELETIONS: readonly DeletionCase[] = [
  {
    name: 'a tag button in the rule check',
    path: '/',
    focusTarget: async (page) => {
      const button = page.getByRole('region', { name: 'Rule check' }).getByRole('button', {
        name: 'TR-01',
      });
      await button.click();
      return button;
    },
  },
  {
    name: 'the clearance tag button in the properties panel',
    path: '/',
    focusTarget: async (page) => {
      await listRow(page, 'TR-01').click();
      return page.getByRole('region', { name: 'Properties' }).getByRole('button', {
        name: 'UPS-01',
      });
    },
  },
  {
    name: 'the Duplicate button in the properties panel',
    path: '/',
    focusTarget: async (page) => {
      await listRow(page, 'TR-01').click();
      return page.getByRole('region', { name: 'Properties' }).getByRole('button', {
        name: 'Duplicate',
      });
    },
  },
  {
    name: 'the item list holding the last item',
    path: '/?seed=1',
    focusTarget: async (page) => {
      const list = itemList(page);
      await list.focus();
      await page.keyboard.press('ArrowDown');
      await expect(list.getByRole('option', { selected: true })).toHaveCount(1);
      return list;
    },
  },
];

for (const deletion of DELETIONS) {
  test(`the Delete key keeps keyboard focus on the page when it removes the focused control: ${deletion.name}`, async ({
    page,
  }) => {
    await page.goto(deletion.path);
    await expect(viewportGroup(page)).toBeVisible();
    await expect(itemList(page)).toBeVisible();
    const target = await deletion.focusTarget(page);
    await target.focus();
    await expect(target).toBeFocused();

    await page.keyboard.press('Delete');
    await expect(liveRegion(page)).toContainText('Deleted');
    await expect
      .poll(() => focusIsOnThePage(page), {
        message: 'focus stays on a control instead of falling back to the document body',
      })
      .toBe(true);
  });
}

test('with single-key shortcuts off, the 3D view, its buttons and the placement banner stop advertising them', async ({
  page,
}) => {
  await openEditor(page);
  const toggle = shortcutDialog(page).getByRole('switch', { name: 'Single-key shortcuts' });
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(shortcutDialog(page)).toBeHidden();

  const view = viewportGroup(page);
  const descriptionId = await view.getAttribute('aria-describedby');
  const description = await page.locator(`[id="${descriptionId ?? ''}"]`).innerText();
  expect
    .soft(description, 'the 3D view instructions name no single-key shortcut')
    .not.toMatch(/(?<![\p{L}\p{N}])(?:R|F|\[|\]|\+|−|\?)(?![\p{L}\p{N}])/u);
  for (const name of ['Zoom in', 'Zoom out', 'Focus selection']) {
    await expect
      .soft(page.getByRole('button', { name, exact: true }), `${name} names no single-key shortcut`)
      .not.toHaveAttribute('aria-keyshortcuts');
  }

  await paletteCard(page, 'Cabinet').click();
  const banner = page.getByRole('main').getByText('Placing: Switchgear cabinet').locator('..');
  await expect(banner).toBeVisible();
  expect
    .soft(await banner.locator('kbd').allInnerTexts(), 'the placement banner shows no R key')
    .not.toContain('R');
});
