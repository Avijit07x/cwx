import {
  englishOnlyPhrases,
  englishOnScreen,
  expect,
  listRow,
  openEditor,
  propertiesPanel,
  statusBar,
  test,
} from '../support.ts';

test('switching to Vietnamese translates every panel, the BOM and the assistant, and switching back restores English', async ({
  page,
}) => {
  await openEditor(page);
  const phrases = await englishOnlyPhrases();
  expect(phrases.length, 'English-only phrases found in the dictionary').toBeGreaterThan(200);
  await listRow(page, 'TR-01').click();
  await expect(propertiesPanel(page).getByRole('heading', { level: 3 })).toHaveText('TR-01');
  expect(
    (await englishOnScreen(page, phrases)).length,
    'the check sees the English text while the editor is in English',
  ).toBeGreaterThan(40);

  await page
    .getByRole('radiogroup', { name: 'Language' })
    .getByRole('radio', { name: 'Tiếng Việt' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  const bom = page.getByRole('region', { name: 'Bảng kê vật tư' });
  await expect(bom.getByRole('columnheader')).toHaveText([
    'Thiết bị',
    'Mã hàng',
    'Đơn giá',
    'Số lượng',
    'Thành tiền',
  ]);
  await expect(bom.getByRole('rowheader', { name: 'Tổng cộng' })).toBeVisible();
  await expect(bom.getByRole('rowheader', { name: 'Máy biến áp khô' })).toBeVisible();
  await expect(bom).toContainText('Giá chỉ mang tính minh họa, tính bằng USD.');
  for (const panel of ['Thiết bị', 'Thiết bị đã đặt', 'Thuộc tính', 'Kiểm tra quy tắc']) {
    await expect(page.getByRole('region', { name: panel, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('toolbar', { name: 'Công cụ chỉnh sửa' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Trợ lý' })).toBeVisible();
  const vietnameseStatus = page.getByRole('contentinfo', { name: 'Trạng thái' });
  await expect(vietnameseStatus).toContainText('12 thiết bị');
  await expect(vietnameseStatus).toContainText('1 lỗi khoảng cách');
  await expect(vietnameseStatus).toContainText('Lưới 0,50 m · Phòng 20 × 12 m');
  const vietnameseProperties = page.getByRole('region', { name: 'Thuộc tính', exact: true });
  await expect(vietnameseProperties).toContainText('Máy biến áp khô');
  await expect(vietnameseProperties).toContainText('1,50 m × 1,00 m × 1,80 m');
  await expect(vietnameseProperties.getByLabel('X', { exact: true })).toHaveValue('15,75');
  await expect(
    page.getByRole('listbox', { name: 'Thiết bị đã đặt' }).getByRole('option', { name: /^TR-01 / }),
    'list positions use Vietnamese decimals',
  ).toContainText('X 15,75 · Z 2,50');
  await expect(bom.getByRole('row', { name: /^Tổng cộng/ })).toContainText('89.000,00 US$');
  expect(
    await englishOnScreen(page, phrases),
    'English-only dictionary text visible in Vietnamese: panels, BOM and status bar',
  ).toEqual([]);
  await expect
    .soft(page, 'the browser tab title is translated too')
    .not.toHaveTitle('Layout Editor');

  await page.getByRole('tab', { name: 'Trợ lý' }).click();
  const assistant = page.getByRole('region', { name: 'Trợ lý bố trí' });
  await assistant.getByRole('button', { name: 'Tóm tắt bố trí' }).click();
  await expect(assistant.getByRole('log')).toContainText('Bố trí có 12 thiết bị');
  await expect(assistant.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  await assistant.getByRole('button', { name: 'Khắc phục lỗi khoảng cách' }).click();
  await expect(assistant.getByRole('group', { name: 'Thay đổi đề xuất' })).toBeVisible();
  await expect(assistant.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  expect(
    await englishOnScreen(page, phrases),
    'English-only dictionary text visible in Vietnamese: assistant',
  ).toEqual([]);

  await page
    .getByRole('radiogroup', { name: 'Ngôn ngữ' })
    .getByRole('radio', { name: 'English' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('region', { name: 'Bill of materials' }).getByRole('columnheader'),
  ).toHaveText(['Item', 'Part no.', 'Unit price', 'Quantity', 'Line total']);
  await expect(page.getByRole('region', { name: 'Layout assistant' })).toBeVisible();
  await expect(statusBar(page)).toContainText('12 items');
});
