import type { Page } from '@playwright/test';
import {
  expect,
  itemList,
  listRow,
  liveRegion,
  openEditor,
  propertiesPanel,
  test,
  viewportGroup,
} from '../support.ts';

type Locale = 'en' | 'vi';

interface Step {
  readonly keys: readonly string[];
  readonly said: Readonly<Record<Locale, RegExp>>;
}

const VIEW_NAME: Readonly<Record<Locale, string>> = {
  en: '3D layout view',
  vi: 'Chế độ xem bố trí 3D',
};
const UNDO = String.raw`(?:⌘Z|Ctrl\+Z)`;
const PASTE = String.raw`(?:⌘V|Ctrl\+V)`;
const AT = String.raw`X \d+[.,]\d{2} m, Z \d+[.,]\d{2} m`;

const STEPS: readonly Step[] = [
  {
    keys: [']'],
    said: {
      en: /^Selected CAB-01, Switchgear cabinet, at X 3\.00 m, Z 1\.25 m\.$/,
      vi: /^Đã chọn CAB-01, Tủ đóng cắt, tại X 3,00 m, Z 1,25 m\.$/,
    },
  },
  {
    keys: ['ArrowRight'],
    said: {
      en: /^CAB-01 moved to X 3\.50 m, Z 1\.25 m\. Too close to CAB-02\.$/,
      vi: /^CAB-01 đã di chuyển đến X 3,50 m, Z 1,25 m\. Quá gần CAB-02\.$/,
    },
  },
  {
    keys: ['Shift+ArrowDown'],
    said: {
      en: /^CAB-01 moved to X 3\.50 m, Z 2\.25 m\.$/,
      vi: /^CAB-01 đã di chuyển đến X 3,50 m, Z 2,25 m\.$/,
    },
  },
  {
    keys: ['r'],
    said: { en: /^CAB-01 rotated to 90°\.$/, vi: /^CAB-01 đã xoay 90°\.$/ },
  },
  {
    keys: ['Shift+R'],
    said: { en: /^CAB-01 rotated to 0°\.$/, vi: /^CAB-01 đã xoay 0°\.$/ },
  },
  {
    keys: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'],
    said: { en: /^CAB-01 is already against the wall\.$/, vi: /^CAB-01 đã sát tường\.$/ },
  },
  {
    keys: ['Control+c'],
    said: {
      en: new RegExp(`^Copied CAB-01\\. Press ${PASTE} to paste a new one\\.$`),
      vi: new RegExp(`^Đã sao chép CAB-01\\. Nhấn ${PASTE} để dán thiết bị mới\\.$`),
    },
  },
  {
    keys: ['Control+v'],
    said: {
      en: new RegExp(`^Pasted CAB-05 at ${AT}\\.`),
      vi: new RegExp(`^Đã dán CAB-05 tại ${AT}\\.`),
    },
  },
  {
    keys: ['Control+d'],
    said: { en: /^Duplicated CAB-05 as CAB-06\.$/, vi: /^Đã nhân bản CAB-05 thành CAB-06\.$/ },
  },
  {
    keys: ['Delete'],
    said: {
      en: new RegExp(`^Deleted CAB-06\\. Press ${UNDO} to undo\\.$`),
      vi: new RegExp(`^Đã xóa CAB-06\\. Nhấn ${UNDO} để hoàn tác\\.$`),
    },
  },
  {
    keys: ['Control+z'],
    said: { en: /^Undone: Delete CAB-06\.$/, vi: /^Đã hoàn tác: Xóa CAB-06\.$/ },
  },
  {
    keys: ['Control+Shift+z'],
    said: { en: /^Redone: Delete CAB-06\.$/, vi: /^Đã làm lại: Xóa CAB-06\.$/ },
  },
  {
    keys: ['['],
    said: {
      en: /^Selected CAB-05, Switchgear cabinet, at /,
      vi: /^Đã chọn CAB-05, Tủ đóng cắt, tại /,
    },
  },
  {
    keys: ['Escape'],
    said: { en: /^Selection cleared\.$/, vi: /^Đã bỏ chọn\.$/ },
  },
  {
    keys: ['3'],
    said: {
      en: /^Placing: Dry-type transformer\. Move it with the mouse or the arrow keys, press Enter to place it, Escape to cancel\.$/,
      vi: /^Đang đặt: Máy biến áp khô\. Di chuyển bằng chuột hoặc phím mũi tên, nhấn Enter để đặt, Escape để hủy\.$/,
    },
  },
  {
    keys: ['ArrowLeft'],
    said: { en: new RegExp(`^${AT}\\.$`), vi: new RegExp(`^${AT}\\.$`) },
  },
  {
    keys: ['Enter'],
    said: {
      en: new RegExp(`^Placed TR-03 at ${AT}\\.`),
      vi: new RegExp(`^Đã đặt TR-03 tại ${AT}\\.`),
    },
  },
  {
    keys: ['Control+z'],
    said: { en: /^Undone: Add TR-03\.$/, vi: /^Đã hoàn tác: Thêm TR-03\.$/ },
  },
  {
    keys: ['1', 'Escape'],
    said: { en: /^Placement cancelled\.$/, vi: /^Đã hủy đặt thiết bị\.$/ },
  },
];

async function switchToVietnamese(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}

for (const locale of ['en', 'vi'] as const) {
  test(`every keyboard edit in the 3D view is announced in the live region (${locale})`, async ({
    page,
  }) => {
    await openEditor(page);
    if (locale === 'vi') await switchToVietnamese(page);
    await page.getByRole('group', { name: VIEW_NAME[locale] }).focus();
    for (const { keys, said } of STEPS) {
      for (const key of keys) await page.keyboard.press(key);
      await expect(liveRegion(page), `${keys.join(' ')} is announced`).toHaveText(said[locale]);
    }
  });
}

test('turning the placement preview with R is announced', async ({ page }) => {
  await openEditor(page);
  await viewportGroup(page).focus();
  await page.keyboard.press('3');
  await expect(liveRegion(page)).toContainText('Placing: Dry-type transformer');
  await page.keyboard.press('r');
  await expect(liveRegion(page), 'the new rotation of the preview is announced').toContainText(
    '90°',
  );
});

test('R announces the turned placement preview after an arrow key has moved it', async ({
  page,
}) => {
  await openEditor(page);
  await viewportGroup(page).focus();
  await page.keyboard.press('3');
  await page.keyboard.press('ArrowRight');
  await expect(liveRegion(page)).toHaveText('X 10.25 m, Z 6.00 m.');
  await page.keyboard.press('r');
  await expect(liveRegion(page), 'the preview turned to 90°').toContainText('90°');
});

test('an arrow key that cannot move the placement preview says it is against the wall', async ({
  page,
}) => {
  await openEditor(page);
  await viewportGroup(page).focus();
  await page.keyboard.press('3');
  for (let step = 0; step < 11; step++) await page.keyboard.press('ArrowUp');
  await expect(liveRegion(page)).toHaveText('X 9.75 m, Z 0.50 m.');
  await page.keyboard.press('ArrowUp');
  await expect(liveRegion(page)).toContainText('against the wall');
});

test('the placement preview says whether its spot meets the clearance rule, not only by its colour', async ({
  page,
}) => {
  await openEditor(page);
  await itemList(page)
    .getByRole('option', { name: /^VFD-01 / })
    .click();
  await viewportGroup(page).focus();
  await page.keyboard.press('2');
  const banner = page
    .getByRole('main')
    .getByText('Placing: Variable frequency drive')
    .locator('..');
  await expect(banner).toBeVisible();
  for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowUp');
  await expect(liveRegion(page)).toHaveText('X 2.25 m, Z 0.25 m.');

  const feedback = `${await banner.innerText()} ${await liveRegion(page).innerText()}`;
  expect(
    feedback,
    'a preview 0.25 m from CAB-01 is reported as too close in text, as the green or red outline shows it',
  ).toContain('CAB-01');

  await page.keyboard.press('Enter');
  await expect(liveRegion(page)).toHaveText(
    'Placed VFD-05 at X 2.25 m, Z 0.25 m. Too close to CAB-01.',
  );
});

test('a tag renamed in the properties panel is announced with the old and the new tag', async ({
  page,
}) => {
  await page.goto('/');
  await listRow(page, 'CAB-01').click();
  const tag = propertiesPanel(page).getByRole('textbox', { name: 'Tag' });
  await tag.fill('CAB-77');
  await tag.press('Enter');
  await expect(liveRegion(page)).toHaveText('Renamed CAB-01 to CAB-77.');
});
