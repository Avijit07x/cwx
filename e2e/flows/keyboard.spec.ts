import type { Page } from '@playwright/test';
import {
  expect,
  itemList,
  liveRegion,
  listRow,
  openEditor,
  paletteCard,
  placementBanner,
  positionInRow,
  propertiesPanel,
  redoButton,
  rotationChoice,
  rowPosition,
  selectedRows,
  statusBar,
  switchToTopView,
  test,
  undoButton,
  viewportGroup,
} from '../support.ts';

const CELL = 0.5;
const RULE_MESSAGE = 'TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).';
const SECOND_TRANSFORMER = { x: 4, z: 9.25 };
const TRANSFORMER_HEIGHT = 1.8;

function onGrid(value: number): boolean {
  return Math.abs(value / CELL - Math.round(value / CELL)) < 1e-9;
}

async function selectRuleMessageText(page: Page): Promise<void> {
  await page
    .getByRole('region', { name: 'Rule check' })
    .getByText(RULE_MESSAGE)
    .click({ clickCount: 3 });
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain(
    RULE_MESSAGE,
  );
}

test('arrows move one cell, R and Shift+R rotate, Ctrl or Cmd+Z undo, Shift+Z redoes, Delete removes', async ({
  page,
}) => {
  await openEditor(page);
  const row = listRow(page, 'CAB-04');
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await viewportGroup(page).focus();

  const moves = [
    { key: 'ArrowRight', x: 9.5, z: 1.25 },
    { key: 'ArrowDown', x: 9.5, z: 1.75 },
    { key: 'ArrowLeft', x: 9, z: 1.75 },
    { key: 'ArrowUp', x: 9, z: 1.25 },
  ];
  for (const { key, x, z } of moves) {
    await page.keyboard.press(key);
    await expect(row, `${key} moves CAB-04 by one 0.5 m cell`).toContainText(rowPosition({ x, z }));
  }
  await page.keyboard.press('Shift+ArrowRight');
  await expect(row, 'Shift+ArrowRight moves two cells').toContainText(
    rowPosition({ x: 10, z: 1.25 }),
  );
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(row).toContainText(rowPosition({ x: 9, z: 1.25 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-04');

  const properties = propertiesPanel(page);
  await page.keyboard.press('r');
  await expect(rotationChoice(page, 90)).toBeChecked();
  await expect(properties).toContainText('0.50 m × 1.00 m × 2.00 m');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Rotate CAB-04');
  const turned = await positionInRow(row);
  expect(
    onGrid(turned.x - 0.25) && onGrid(turned.z - 0.5),
    'the turned footprint is on the grid',
  ).toBe(true);
  await page.keyboard.press('Shift+R');
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(properties).toContainText('1.00 m × 0.50 m × 2.00 m');
  await expect(row, 'turning back restores the position').toContainText(
    rowPosition({ x: 9, z: 1.25 }),
  );

  await page.keyboard.press('Control+z');
  await expect(rotationChoice(page, 90)).toBeChecked();
  await page.keyboard.press('Meta+z');
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(row).toContainText(rowPosition({ x: 9, z: 1.25 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-04');
  await page.keyboard.press('Control+Shift+z');
  await expect(rotationChoice(page, 90)).toBeChecked();
  await page.keyboard.press('Meta+Shift+z');
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(redoButton(page)).toBeDisabled();

  await page.keyboard.press('Delete');
  await expect(row).toHaveCount(0);
  await expect(statusBar(page)).toContainText('11 items');
  await expect(liveRegion(page)).toContainText('Deleted CAB-04.');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Delete CAB-04');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row).toContainText(rowPosition({ x: 9, z: 1.25 }));
  await expect(row, 'undoing the delete restores the selection').toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(statusBar(page)).toContainText('12 items');
});

test('Escape cancels placement from a shortcut or the palette, and then clears the selection', async ({
  page,
}) => {
  await openEditor(page);
  const cabinet = paletteCard(page, 'Cabinet');
  const banner = placementBanner(page, 'Switchgear cabinet');
  await viewportGroup(page).focus();

  await page.keyboard.press('1');
  await expect(cabinet).toHaveAttribute('aria-pressed', 'true');
  await expect(banner).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(banner).toBeHidden();
  await expect(cabinet).toHaveAttribute('aria-pressed', 'false');
  await expect(liveRegion(page)).toHaveText('Placement cancelled.');
  await expect(statusBar(page)).toContainText('12 items');
  await expect(undoButton(page)).toBeDisabled();

  await cabinet.click();
  await expect(banner).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(banner).toBeHidden();
  await expect(statusBar(page)).toContainText('12 items');

  await viewportGroup(page).focus();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(listRow(page, 'CAB-05')).toHaveAttribute('aria-selected', 'true');
  await expect(banner).toBeHidden();
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Add CAB-05');

  await page.keyboard.press('Escape');
  await expect(selectedRows(page)).toHaveCount(0);
  await expect(liveRegion(page)).toHaveText('Selection cleared.');
  await expect(statusBar(page)).toContainText('13 items');
});

test('an arrow key against the wall leaves the item where it is, says so and adds no undo step', async ({
  page,
}) => {
  await openEditor(page);
  const row = listRow(page, 'CAB-01');
  await row.click();
  await viewportGroup(page).focus();

  await page.keyboard.press('ArrowUp');
  await expect(row).toContainText(rowPosition({ x: 3, z: 0.75 }));
  await page.keyboard.press('ArrowUp');
  await expect(row, 'the cabinet reaches the north wall').toContainText(
    rowPosition({ x: 3, z: 0.25 }),
  );
  await page.keyboard.press('ArrowUp');
  await expect(liveRegion(page)).toHaveText('CAB-01 is already against the wall.');
  await expect(row).toContainText(rowPosition({ x: 3, z: 0.25 }));

  await undoButton(page).click();
  await expect(row).toContainText(rowPosition({ x: 3, z: 0.75 }));
  await undoButton(page).click();
  await expect(row).toContainText(rowPosition({ x: 3, z: 1.25 }));
  await expect(undoButton(page), 'two moves, two undo steps').toBeDisabled();
});

test('a cabinet against the north wall stays on it when turned with R and back with Shift+R, or four times', async ({
  page,
}) => {
  await page.goto('/');
  const cabinet = listRow(page, 'CAB-01');
  await cabinet.click();
  const z = propertiesPanel(page).getByLabel('Z', { exact: true });
  await z.fill('0.25');
  await z.press('Enter');
  await expect(cabinet).toContainText(rowPosition({ x: 3, z: 0.25 }));

  await cabinet.click();
  await page.keyboard.press('r');
  await expect(cabinet).toContainText(rowPosition({ x: 2.75, z: 0.5 }));
  await page.keyboard.press('Shift+R');
  await expect(cabinet).toContainText(rowPosition({ x: 3, z: 0.25 }));
  for (let turn = 0; turn < 4; turn++) await page.keyboard.press('r');
  await expect(cabinet).toContainText(rowPosition({ x: 3, z: 0.25 }));
});

test('Ctrl or Cmd+C copies the item picked in the 3D view while text elsewhere on the page is still selected', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await selectRuleMessageText(page);

  const transformer = toScreen(SECOND_TRANSFORMER, TRANSFORMER_HEIGHT);
  await page.mouse.click(transformer.x, transformer.y);
  await expect(selectedRows(page)).toContainText('TR-02');

  await page.keyboard.press('ControlOrMeta+c');
  await expect(liveRegion(page)).toHaveText(/^Copied TR-02\./);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(itemList(page).getByRole('option')).toHaveCount(13);
  await expect(liveRegion(page)).toContainText('Pasted TR-03');
});

test('Ctrl or Cmd+C copies the item picked in the list while text elsewhere on the page is still selected', async ({
  page,
}) => {
  await openEditor(page);
  await selectRuleMessageText(page);

  await listRow(page, 'TR-02').click();
  await expect(selectedRows(page)).toContainText('TR-02');

  await page.keyboard.press('ControlOrMeta+c');
  await expect(liveRegion(page)).toHaveText(/^Copied TR-02\./);
});
