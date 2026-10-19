import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support.ts';

const LONG_WORD = 'W'.repeat(300);
const COLUMN_SCROLLERS = 'aside, [role="tabpanel"], [role="log"]';
const SIDEBAR = 'Equipment and placed items';

const LAYOUTS = [
  { name: 'desktop', width: 1920, height: 1080, pageScrollsVertically: false },
  { name: 'stacked', width: 900, height: 1080, pageScrollsVertically: true },
] as const;

async function swipeSideways(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('The swipe target has no size');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(600, 0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

async function overflowingColumns(page: Page): Promise<string[]> {
  return page
    .locator(COLUMN_SCROLLERS)
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth !== element.clientWidth)
        .map(
          (element) =>
            `${element.getAttribute('aria-label') ?? element.getAttribute('role') ?? element.tagName} is ${element.scrollWidth} px wide inside ${element.clientWidth} px`,
        ),
    );
}

async function pageScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      sideways: root.scrollWidth - root.clientWidth,
      vertical: root.scrollHeight - root.clientHeight,
      scrollX: window.scrollX,
    };
  });
}

async function expectEquipmentHeadingInFullView(page: Page): Promise<void> {
  const heading = await page.getByRole('heading', { name: 'Equipment', exact: true }).boundingBox();
  const sidebar = await page.getByRole('complementary', { name: SIDEBAR }).boundingBox();
  const viewport = page.viewportSize();
  if (!heading || !sidebar || !viewport) throw new Error('The sidebar is not laid out');
  expect(heading.x).toBeGreaterThanOrEqual(Math.max(0, sidebar.x));
  expect(heading.x + heading.width).toBeLessThanOrEqual(
    Math.min(viewport.width, sidebar.x + sidebar.width),
  );
}

for (const layout of LAYOUTS) {
  test.describe(`${layout.name} layout at ${layout.width} px`, () => {
    test.use({ viewport: { width: layout.width, height: layout.height } });

    async function expectNothingPushedSideways(page: Page): Promise<void> {
      expect(await overflowingColumns(page)).toEqual([]);
      await expectEquipmentHeadingInFullView(page);
      const scroll = await pageScroll(page);
      expect(scroll.sideways).toBe(0);
      expect(scroll.scrollX).toBe(0);
      if (!layout.pageScrollsVertically) expect(scroll.vertical).toBe(0);
    }

    test('a 300-character word typed into the item filter wraps inside the sidebar', async ({
      page,
    }) => {
      await page.goto('/');
      const filter = page.getByRole('searchbox', { name: 'Filter placed items' });
      await filter.pressSequentially(LONG_WORD);
      const noMatch = page.getByText(/^No items match “W+…”$/);
      await expect(noMatch).toBeVisible();

      await swipeSideways(page, noMatch);
      await expectNothingPushedSideways(page);
    });

    test('a 300-character word sent to the assistant wraps inside the inspector', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: 'Assistant' }).click();
      const message = page.getByRole('textbox', { name: 'Message to the assistant' });
      await message.pressSequentially(LONG_WORD);
      await expectNothingPushedSideways(page);

      await message.press('Enter');
      const log = page.getByRole('log', { name: 'Conversation' });
      await expect(log.getByText(LONG_WORD)).toBeVisible();
      await expect(log).toHaveAttribute('aria-busy', 'false');

      await swipeSideways(page, log);
      await expectNothingPushedSideways(page);
    });
  });
}
