import type { Locator, Page } from '@playwright/test';
import {
  boxOf,
  expect,
  itemList,
  liveRegion,
  listRow,
  openEditor,
  paletteCard,
  placementBanner,
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
  type ScreenPoint,
} from '../support.ts';

const UNDO_KEY = /(⌘Z|Ctrl\+Z)/;
const UPS_HEIGHT = 1.6;
const DRIVE_HEIGHT = 1.8;
const HISTORY_LIMIT = 200;
const TRANSFORMER_TOP = { x: 15.75, z: 2.5 };
const TRANSFORMER_HEIGHT = 1.8;

const CAB_01 = { x: 3, z: 1.25 };
const TYPED = { x: 6, z: 1.25 };
const DROP_POINT = { x: 9, z: 6 };
const DROPPED = { x: 9, z: 6.25 };
const EMPTY_FLOOR = { x: 15, z: 6 };
const DRAG_STEPS = 12;

const DRAFT_KEY = 'layout-editor:v1:draft:demo';

const savedItems = Array.from({ length: 30 }, (_, index) => ({
  id: `mine-${String(index)}`,
  kind: 'drive',
  tag: `MINE-${String(index).padStart(2, '0')}`,
  x: 0.25 + (index % 20),
  z: 0.25 + Math.floor(index / 20) * 2,
  rotation: 0,
}));

const tagTooLong = {
  id: 'mine-30',
  kind: 'drive',
  tag: 'T'.repeat(25),
  x: 10.25,
  z: 10.25,
  rotation: 0,
};

const UNREADABLE_DRAFT = JSON.stringify({ version: 1, items: [...savedItems, tagTooLong] });

function editTool(page: Page, name: string): Locator {
  return page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name, exact: true });
}

function ruleCheck(page: Page): Locator {
  return page.getByRole('region', { name: 'Rule check' });
}

function bom(page: Page): Locator {
  return page.getByRole('region', { name: 'Bill of materials' });
}

function bomCells(page: Page, name: RegExp): Locator {
  return bom(page).getByRole('row', { name }).getByRole('cell');
}

function tagField(page: Page): Locator {
  return propertiesPanel(page).getByRole('textbox', { name: 'Tag' });
}

function hudValue(page: Page, label: string): Locator {
  return page
    .getByRole('region', { name: 'Performance' })
    .locator('dt', { hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

async function pixelsAt(
  page: Page,
  points: readonly ScreenPoint[],
): Promise<readonly (readonly number[])[]> {
  const shot = await page.screenshot();
  return page.evaluate(
    async ({ data, at }) => {
      const image = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(image);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D context to read the screenshot');
      context.drawImage(bitmap, 0, 0);
      return at.map((point) =>
        Array.from(context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data),
      );
    },
    { data: shot.toString('base64'), at: points },
  );
}

function blue(pixel: readonly number[] | undefined): number {
  return pixel?.[2] ?? Number.NaN;
}

async function touchDrag(page: Page, from: ScreenPoint, to: ScreenPoint): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const finger = (step: number) => [
    {
      x: from.x + ((to.x - from.x) * step) / DRAG_STEPS,
      y: from.y + ((to.y - from.y) * step) / DRAG_STEPS,
      id: 1,
    },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: finger(0) });
  for (let step = 1; step <= DRAG_STEPS; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: finger(step),
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

test('the empty 20 m × 12 m room draws in 4 draw calls, and the palette offers four equipment types with their sizes', async ({
  page,
}) => {
  await page.goto('/?seed=0&perf=1');
  await expect(statusBar(page)).toContainText('0 items');
  await expect(statusBar(page)).toContainText('Grid 0.50 m · Room 20 × 12 m');
  const drawCalls = hudValue(page, 'Draw calls');
  await expect(drawCalls).toHaveText(/^\d+$/);
  expect(Number(await drawCalls.innerText()), 'an empty scene costs at most 4 draw calls').toBe(4);

  const cards = page.getByRole('region', { name: 'Equipment' }).getByRole('button');
  await expect(cards).toHaveText(['Cabinet', 'Drive', 'Transformer', 'UPS']);
  await expect(paletteCard(page, 'Cabinet')).toHaveAccessibleDescription(
    'Width 1.00 m, depth 0.50 m, height 2.00 m',
  );
  await expect(paletteCard(page, 'Drive')).toHaveAccessibleDescription(
    'Width 0.50 m, depth 0.50 m, height 1.80 m',
  );
  await expect(paletteCard(page, 'Transformer')).toHaveAccessibleDescription(
    'Width 1.50 m, depth 1.00 m, height 1.80 m',
  );
  await expect(paletteCard(page, 'UPS')).toHaveAccessibleDescription(
    'Width 1.00 m, depth 1.00 m, height 1.60 m',
  );
});

test('from the keyboard, 3 picks a transformer, arrows move the preview a cell at a time, Enter places it, and the preview stops at the wall', async ({
  page,
}) => {
  await openEditor(page);
  await viewportGroup(page).focus();

  await page.keyboard.press('3');
  await expect(paletteCard(page, 'Transformer')).toHaveAttribute('aria-pressed', 'true');
  await expect(placementBanner(page, 'Dry-type transformer')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(liveRegion(page)).toHaveText('X 10.25 m, Z 6.00 m.');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(liveRegion(page)).toHaveText('X 10.25 m, Z 7.00 m.');
  await page.keyboard.press('Enter');

  const placed = listRow(page, 'TR-03');
  await expect(placed).toContainText(rowPosition({ x: 10.25, z: 7 }));
  await expect(placed).toHaveAttribute('aria-selected', 'true');
  await expect(liveRegion(page)).toHaveText('Placed TR-03 at X 10.25 m, Z 7.00 m.');
  await expect(placementBanner(page, 'Dry-type transformer')).toBeHidden();
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Add TR-03');

  await page.keyboard.press('2');
  await expect(paletteCard(page, 'Drive')).toHaveAttribute('aria-pressed', 'true');
  for (let step = 0; step < 24; step++) await page.keyboard.press('ArrowLeft');
  await expect(liveRegion(page)).toContainText('X 0.25 m');
  await page.keyboard.press('ArrowLeft');
  await expect(liveRegion(page), 'the preview cannot leave the room').toContainText('X 0.25 m');
  await page.keyboard.press('Enter');
  await expect(listRow(page, 'VFD-05')).toContainText(/X 0\.25 · Z \d+\.\d{2}/);
  await expect(statusBar(page)).toContainText('14 items');

  await undoButton(page).click();
  await expect(listRow(page, 'VFD-05')).toHaveCount(0);
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Add TR-03');
});

test('Shift+click on the floor keeps placing, a plain click places the last one, and a Shift+clicked palette card keeps placing until Escape', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const drive = paletteCard(page, 'Drive');

  await drive.click();
  const first = toScreen({ x: 12, z: 6 });
  await page.keyboard.down('Shift');
  await page.mouse.click(first.x, first.y);
  await page.keyboard.up('Shift');
  await expect(listRow(page, 'VFD-05')).toContainText(rowPosition({ x: 12.25, z: 6.25 }));
  await expect(drive, 'Shift+click stays in placement mode').toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(placementBanner(page, 'Variable frequency drive')).toBeVisible();

  const second = toScreen({ x: 14, z: 6 });
  await page.mouse.click(second.x, second.y);
  await expect(listRow(page, 'VFD-06')).toContainText(rowPosition({ x: 14.25, z: 6.25 }));
  await expect(drive, 'a plain click ends placement').toHaveAttribute('aria-pressed', 'false');
  await expect(placementBanner(page, 'Variable frequency drive')).toBeHidden();

  const ups = paletteCard(page, 'UPS');
  await page.keyboard.down('Shift');
  await ups.click();
  await page.keyboard.up('Shift');
  await expect(page.getByText('Keeps placing until you press Esc')).toBeVisible();
  for (const point of [
    { x: 10, z: 7 },
    { x: 16, z: 10 },
  ]) {
    const at = toScreen(point);
    await page.mouse.click(at.x, at.y);
  }
  await expect(listRow(page, 'UPS-03')).toContainText(rowPosition({ x: 10, z: 7 }));
  await expect(listRow(page, 'UPS-04')).toContainText(rowPosition({ x: 16, z: 10 }));
  await expect(ups).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(ups).toHaveAttribute('aria-pressed', 'false');
  await expect(statusBar(page)).toContainText('16 items');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Add UPS-04');
});

test('a click beyond the east wall while placing puts the item against the wall', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const view = await boxOf(canvas);
  await paletteCard(page, 'Cabinet').click();
  const beyond = toScreen({ x: 21.5, z: 6 });
  expect(beyond.x, 'the click is still inside the 3D view').toBeLessThan(view.x + view.width);
  await page.mouse.click(beyond.x, beyond.y);
  await expect(listRow(page, 'CAB-05')).toContainText(rowPosition({ x: 19.5, z: 6.25 }));
});

test('the toolbar rotates the selection in place one step at a time, and Backspace and the toolbar Delete remove items', async ({
  page,
}) => {
  await openEditor(page);
  const row = listRow(page, 'CAB-04');
  await row.click();

  await editTool(page, 'Rotate clockwise').click();
  await expect(rotationChoice(page, 90)).toBeChecked();
  await expect(row).toContainText(rowPosition({ x: 8.75, z: 1 }));
  await expect(liveRegion(page)).toHaveText('CAB-04 rotated to 90°.');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Rotate CAB-04');
  await editTool(page, 'Rotate counter-clockwise').click();
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(row, 'turning back restores the footprint').toContainText(
    rowPosition({ x: 9, z: 1.25 }),
  );
  await undoButton(page).click();
  await expect(rotationChoice(page, 90)).toBeChecked();

  const remove = editTool(page, 'Delete');
  await remove.click();
  await expect(row).toHaveCount(0);
  await expect(liveRegion(page)).toContainText('Deleted CAB-04. Press ');
  await expect(liveRegion(page)).toContainText(UNDO_KEY);
  await expect(remove, 'nothing is left to delete').toBeDisabled();

  await listRow(page, 'VFD-01').click();
  await viewportGroup(page).focus();
  await page.keyboard.press('Backspace');
  await expect(listRow(page, 'VFD-01')).toHaveCount(0);
  await expect(statusBar(page)).toContainText('10 items');

  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(listRow(page, 'VFD-01')).toContainText(rowPosition({ x: 3.25, z: 3.75 }));
  await expect(row).toContainText(rowPosition({ x: 8.75, z: 1 }));
  await expect(statusBar(page)).toContainText('12 items');
});

test('Delete in the item list removes the item and selects the next one, or the previous one at the end, and undo restores both', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'VFD-02').click();
  await itemList(page).focus();
  await page.keyboard.press('Delete');
  await expect(listRow(page, 'VFD-02')).toHaveCount(0);
  await expect(listRow(page, 'VFD-03')).toHaveAttribute('aria-selected', 'true');
  await expect(liveRegion(page)).toContainText('Deleted VFD-02. Press ');

  await page.keyboard.press('End');
  await expect(listRow(page, 'UPS-02')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Backspace');
  await expect(listRow(page, 'UPS-02')).toHaveCount(0);
  await expect(listRow(page, 'TR-02'), 'the last row hands the selection back').toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(statusBar(page)).toContainText('10 items');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(listRow(page, 'UPS-02')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(listRow(page, 'VFD-02')).toHaveAttribute('aria-selected', 'true');
  await expect(statusBar(page)).toContainText('12 items');
});

test('while an item is dragged the rule check, the list flags and the status bar follow it live, and the BOM waits for the drop', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const grab = toScreen({ x: 12.5, z: 9.5 });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const nearTransformer = toScreen({ x: 5.5, z: 9.5 });
  await page.mouse.move(nearTransformer.x, nearTransformer.y, { steps: 10 });

  await expect(listRow(page, 'UPS-02')).toContainText(rowPosition({ x: 5.5, z: 9.5 }));
  await expect(ruleCheck(page)).toContainText('2 issues');
  await expect(ruleCheck(page)).toContainText(
    'TR-02 and UPS-02 are 0.50 m apart (minimum 0.60 m).',
  );
  await expect(listRow(page, 'UPS-02')).toContainText('Too close');
  await expect(listRow(page, 'TR-02')).toContainText('Too close');
  await expect(statusBar(page)).toContainText('2 clearance issues');
  await expect(
    page.getByRole('main').getByText('TR-02 and UPS-02 are 0.50 m apart (minimum 0.60 m).'),
  ).toBeVisible();
  await expect(undoButton(page), 'nothing is committed during the drag').toBeDisabled();
  await expect(bomCells(page, /UPS unit/)).toHaveText([
    'LE-UPS-1010',
    '$9,900.00',
    '2',
    '$19,800.00',
  ]);

  await page.mouse.up();
  await expect(liveRegion(page)).toHaveText(
    'UPS-02 moved to X 5.50 m, Z 9.50 m. Too close to TR-02.',
  );
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move UPS-02');
  await undoButton(page).click();
  await expect(ruleCheck(page)).toContainText('1 issue');
  await expect(listRow(page, 'TR-02')).not.toContainText('Too close');
});

test('copy and paste add a new item at the nearest free spot to the pointer, or next to the selection, one undo step each, and the BOM recounts', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await expect(bomCells(page, /UPS unit/)).toHaveText([
    'LE-UPS-1010',
    '$9,900.00',
    '2',
    '$19,800.00',
  ]);

  await listRow(page, 'UPS-02').click();
  await page.keyboard.press('ControlOrMeta+c');
  await expect(liveRegion(page)).toContainText('Copied UPS-02. Press ');
  const target = toScreen({ x: 16, z: 8 });
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('ControlOrMeta+v');
  const pasted = listRow(page, 'UPS-03');
  await expect(pasted).toContainText(rowPosition({ x: 16, z: 8 }));
  await expect(pasted).toHaveAttribute('aria-selected', 'true');
  await expect(liveRegion(page)).toHaveText('Pasted UPS-03 at X 16.00 m, Z 8.00 m.');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Paste UPS-03');
  await expect(bomCells(page, /UPS unit/)).toHaveText([
    'LE-UPS-1010',
    '$9,900.00',
    '3',
    '$29,700.00',
  ]);
  await expect(bomCells(page, /^Total/)).toHaveText(['13', '$98,900.00']);

  await page.mouse.move(5, 5);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(
    listRow(page, 'UPS-04'),
    'without a pointer the copy lands next to the selection',
  ).toContainText(rowPosition({ x: 16, z: 6 }));
  await expect(statusBar(page), 'pasted copies meet the clearance rule').toContainText(
    '1 clearance issue',
  );

  await undoButton(page).click();
  await undoButton(page).click();
  await expect(pasted).toHaveCount(0);
  await expect(bomCells(page, /UPS unit/)).toHaveText([
    'LE-UPS-1010',
    '$9,900.00',
    '2',
    '$19,800.00',
  ]);
  await expect(redoButton(page)).toHaveAccessibleName('Redo: Paste UPS-03');
  await redoButton(page).click();
  await expect(pasted).toContainText(rowPosition({ x: 16, z: 8 }));
});

test('duplicate from the keyboard, the toolbar and the properties panel adds the next tag at a free spot, one undo step each', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'UPS-02').click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(listRow(page, 'UPS-03')).toContainText(rowPosition({ x: 14.5, z: 9.5 }));
  await expect(listRow(page, 'UPS-03')).toHaveAttribute('aria-selected', 'true');
  await expect(liveRegion(page)).toHaveText('Duplicated UPS-02 as UPS-03.');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Duplicate UPS-03');

  await editTool(page, 'Duplicate').click();
  await expect(listRow(page, 'UPS-04')).toContainText(rowPosition({ x: 16.5, z: 9.5 }));
  await propertiesPanel(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(listRow(page, 'UPS-05')).toContainText(rowPosition({ x: 18.5, z: 9.5 }));

  await expect(statusBar(page)).toContainText('15 items');
  await expect(statusBar(page)).toContainText('1 clearance issue');
  await expect(bomCells(page, /UPS unit/)).toHaveText([
    'LE-UPS-1010',
    '$9,900.00',
    '5',
    '$49,500.00',
  ]);
  await expect(bomCells(page, /^Total/)).toHaveText(['15', '$118,700.00']);

  for (let step = 0; step < 3; step++) await undoButton(page).click();
  await expect(statusBar(page)).toContainText('12 items');
  await expect(bomCells(page, /^Total/)).toHaveText(['12', '$89,000.00']);
  await expect(undoButton(page)).toBeDisabled();
});

test('Clear layout empties the list, the BOM and the rule check in one step, and one undo brings everything and the selection back', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'CAB-02').click();
  const clear = editTool(page, 'Clear layout');
  await clear.click();

  await expect(statusBar(page)).toContainText('0 items');
  await expect(page.getByText('No items placed yet')).toBeVisible();
  await expect(bom(page)).toContainText('0 items · $0.00');
  await expect(bom(page).getByText('No equipment yet')).toBeVisible();
  await expect(ruleCheck(page).getByText('No clearance issues')).toBeVisible();
  await expect(propertiesPanel(page).getByText('No item selected')).toBeVisible();
  await expect(liveRegion(page)).toContainText('Layout cleared. Press ');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Clear layout');
  await expect(clear, 'an empty layout has nothing to clear').toBeDisabled();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(statusBar(page)).toContainText('12 items');
  await expect(selectedRows(page)).toHaveCount(1);
  await expect(listRow(page, 'CAB-02')).toHaveAttribute('aria-selected', 'true');
  await expect(bomCells(page, /^Total/)).toHaveText(['12', '$89,000.00']);
  await expect(ruleCheck(page)).toContainText(
    'TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).',
  );
  await expect(liveRegion(page)).toHaveText('Undone: Clear layout.');
  await expect(undoButton(page), 'clearing was one step').toBeDisabled();
});

test('renaming commits on Enter as one undo step, and duplicate (any case), over-long and empty tags are refused inline', async ({
  page,
}) => {
  await openEditor(page);
  await listRow(page, 'CAB-01').click();
  const tag = tagField(page);

  await tag.fill('cab-02');
  await tag.press('Enter');
  await expect(propertiesPanel(page)).toContainText('cab-02 is already used by another item.');
  await expect(tag).toHaveAttribute('aria-invalid', 'true');
  await expect(tag).toHaveAccessibleDescription('cab-02 is already used by another item.');
  await expect(liveRegion(page)).toHaveText('cab-02 is already used by another item.');

  await tag.fill('M'.repeat(25));
  await tag.press('Enter');
  await expect(tag).toHaveAccessibleDescription('Use at most 24 characters.');
  await tag.fill('   ');
  await tag.press('Enter');
  await expect(tag).toHaveAccessibleDescription('Enter a tag.');
  await tag.press('Escape');
  await expect(tag).toHaveValue('CAB-01');
  await expect(undoButton(page), 'refused names change nothing').toBeDisabled();

  await tag.fill(` ${'M'.repeat(24)} `);
  await tag.press('Enter');
  const renamed = listRow(page, 'M'.repeat(24));
  await expect(renamed).toHaveAttribute('aria-selected', 'true');
  await expect(tag).toHaveValue('M'.repeat(24));
  await expect(undoButton(page)).toHaveAccessibleName(`Undo: Rename ${'M'.repeat(24)}`);
  await undoButton(page).click();
  await expect(listRow(page, 'CAB-01')).toHaveAttribute('aria-selected', 'true');
  await expect(tag).toHaveValue('CAB-01');
  await redoButton(page).click();
  await expect(renamed).toHaveCount(1);
});

test('a tag or X value typed in the properties panel is committed when the next item is picked in the list or the floor is clicked', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await listRow(page, 'CAB-01').click();
  await tagField(page).fill('MAIN-01');
  await listRow(page, 'TR-01').click();
  await expect(listRow(page, 'TR-01')).toHaveAttribute('aria-selected', 'true');
  await expect(listRow(page, 'MAIN-01')).toHaveCount(1);

  await listRow(page, 'CAB-04').click();
  await propertiesPanel(page).getByLabel('X', { exact: true }).fill('11');
  const floor = toScreen({ x: 10, z: 6 });
  await page.mouse.click(floor.x, floor.y);
  await expect(selectedRows(page)).toHaveCount(0);
  await expect(listRow(page, 'CAB-04')).toContainText(rowPosition({ x: 11, z: 1.25 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-04');
});

test('a tag typed in the properties panel is kept when the next item is picked in the 3D view', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await listRow(page, 'CAB-01').click();
  await tagField(page).fill('MAIN-01');

  const transformer = toScreen(TRANSFORMER_TOP, TRANSFORMER_HEIGHT);
  await page.mouse.click(transformer.x, transformer.y);
  await expect(listRow(page, 'TR-01')).toHaveAttribute('aria-selected', 'true');
  await expect(listRow(page, 'MAIN-01'), 'the typed tag is committed, not dropped').toHaveCount(1);
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Rename MAIN-01');
});

test('an X value typed in the properties panel is kept when the next item is picked in the 3D view', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await listRow(page, 'CAB-04').click();
  await propertiesPanel(page).getByLabel('X', { exact: true }).fill('11');

  const transformer = toScreen(TRANSFORMER_TOP, TRANSFORMER_HEIGHT);
  await page.mouse.click(transformer.x, transformer.y);
  await expect(listRow(page, 'TR-01')).toHaveAttribute('aria-selected', 'true');
  await expect(
    listRow(page, 'CAB-04'),
    'the typed position is committed, not dropped',
  ).toContainText(rowPosition({ x: 11, z: 1.25 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-04');
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('an X typed but not confirmed is committed when a finger drags the same item, so a later tap on the floor leaves the item where it was dropped', async ({
    page,
  }) => {
    const canvas = await openEditor(page);
    const toScreen = await switchToTopView(page, canvas);
    await listRow(page, 'CAB-01').click();
    await propertiesPanel(page).getByLabel('X', { exact: true }).fill(String(TYPED.x));

    await touchDrag(page, toScreen(CAB_01), toScreen(DROP_POINT));
    const row = listRow(page, 'CAB-01');
    await expect(row, 'the item follows the finger').toContainText(rowPosition(DROPPED));

    const empty = toScreen(EMPTY_FLOOR);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(selectedRows(page)).toHaveCount(0);
    await expect(row, 'the tap does not apply the typed value again').toContainText(
      rowPosition(DROPPED),
    );

    await undoButton(page).click();
    await expect(
      row,
      'the typed value was committed as its own step, before the drag',
    ).toContainText(rowPosition(TYPED));
  });
});

test('the X and Z steppers move the item 0.5 m per press, one undo step each, and stop at the wall', async ({
  page,
}) => {
  await openEditor(page);
  const row = listRow(page, 'CAB-01');
  await row.click();
  const properties = propertiesPanel(page);
  const increaseX = properties.getByRole('button', { name: 'Increase X' });
  const decreaseZ = properties.getByRole('button', { name: 'Decrease Z' });

  await increaseX.click();
  await expect(row).toContainText(rowPosition({ x: 3.5, z: 1.25 }));
  await expect(properties.getByLabel('X', { exact: true })).toHaveValue('3.50');
  await decreaseZ.click();
  await expect(row).toContainText(rowPosition({ x: 3.5, z: 0.75 }));
  await decreaseZ.click();
  await expect(row).toContainText(rowPosition({ x: 3.5, z: 0.25 }));
  await expect(decreaseZ, 'the cabinet touches the north wall').toBeDisabled();
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-01');

  for (const expected of [
    { x: 3.5, z: 0.75 },
    { x: 3.5, z: 1.25 },
    { x: 3, z: 1.25 },
  ]) {
    await undoButton(page).click();
    await expect(row).toContainText(rowPosition(expected));
  }
  await expect(undoButton(page), 'three presses, three undo steps').toBeDisabled();
});

test('the clearance rule names both items and flags them in the list, the properties and the 3D view, and every flag clears once the gap is fixed', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  await page.mouse.move(5, 5);

  await expect(ruleCheck(page)).toContainText('1 issue');
  await expect(ruleCheck(page)).toContainText(
    'TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).',
  );
  await expect(listRow(page, 'TR-01')).toContainText('Too close');
  await expect(listRow(page, 'UPS-01')).toContainText('Too close');
  await expect(listRow(page, 'UPS-02')).not.toContainText('Too close');
  await expect(statusBar(page)).toContainText('1 clearance issue');
  const [tooClose, clear] = await pixelsAt(page, [
    toScreen({ x: 17.5, z: 2.5 }, UPS_HEIGHT),
    toScreen({ x: 12.5, z: 9.5 }, UPS_HEIGHT),
  ]);
  expect(blue(tooClose), 'the 3D view tints UPS-01 red').toBeLessThan(blue(clear) * 0.75);

  await listRow(page, 'UPS-01').click();
  await expect(propertiesPanel(page)).toContainText('0.50 m to TR-01');
  await propertiesPanel(page).getByRole('button', { name: 'Increase X' }).click();
  await expect(listRow(page, 'UPS-01')).toContainText(rowPosition({ x: 18, z: 2.5 }));
  await expect(propertiesPanel(page)).toContainText('Meets the 0.60 m clearance');
  await expect(ruleCheck(page).getByText('No clearance issues')).toBeVisible();
  await expect(statusBar(page)).toContainText('No issues');
  await expect(itemList(page).getByText('Too close')).toHaveCount(0);

  await viewportGroup(page).focus();
  await page.keyboard.press('Escape');
  await expect(selectedRows(page)).toHaveCount(0);
  await page.mouse.move(5, 5);
  await expect
    .poll(
      async () => {
        const [moved, idle] = await pixelsAt(page, [
          toScreen({ x: 18, z: 2.5 }, UPS_HEIGHT),
          toScreen({ x: 12.5, z: 9.5 }, UPS_HEIGHT),
        ]);
        return Math.abs(blue(moved) - blue(idle));
      },
      { message: 'UPS-01 loses its red tint' },
    )
    .toBeLessThan(25);
});

test('among 500 items the list scrolls to a selection made with [ and ] or in the 3D view', async ({
  page,
}) => {
  const canvas = await openEditor(page, '/?seed=500');
  const toScreen = await switchToTopView(page, canvas);
  const list = itemList(page);
  const isRowInView = async () => {
    const listBox = await boxOf(list);
    const rowBox = await boxOf(selectedRows(page));
    return rowBox.y >= listBox.y - 1 && rowBox.y + rowBox.height <= listBox.y + listBox.height + 1;
  };

  await viewportGroup(page).focus();
  await page.keyboard.press('[');
  await expect(selectedRows(page)).toHaveAttribute('aria-posinset', '500');
  await expect.poll(isRowInView, { message: 'the last row scrolls into view' }).toBe(true);
  const last = await selectedRows(page).innerText();
  const match = /^(\S+)\nDrive\nX (\d+\.\d+) · Z (\d+\.\d+)/.exec(last);
  if (!match) throw new Error(`The last generated item is not a drive: ${last}`);
  const [, tag = '', x = '', z = ''] = match;

  await page.keyboard.press(']');
  await expect(selectedRows(page)).toHaveAttribute('aria-posinset', '1');
  await expect.poll(isRowInView, { message: 'the first row scrolls into view' }).toBe(true);

  const top = toScreen({ x: Number(x), z: Number(z) }, DRIVE_HEIGHT);
  await page.mouse.click(top.x, top.y);
  await expect(listRow(page, tag)).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(isRowInView, { message: 'picking the item in 3D scrolls its row into view' })
    .toBe(true);
});

test('autosave keeps every edit across a reload, while a ?seed=N session neither saves nor touches the draft', async ({
  page,
}) => {
  await openEditor(page);
  await expect(statusBar(page)).toContainText('Autosave on');
  await listRow(page, 'CAB-01').click();
  await viewportGroup(page).focus();
  await page.keyboard.press('ArrowRight');
  await listRow(page, 'UPS-02').click();
  await viewportGroup(page).focus();
  await page.keyboard.press('Delete');
  await expect(statusBar(page)).toContainText('Saved');

  await page.reload();
  await expect(page.getByText('Restored your last draft.')).toBeVisible();
  await expect(listRow(page, 'CAB-01')).toContainText(rowPosition({ x: 3.5, z: 1.25 }));
  await expect(listRow(page, 'UPS-02')).toHaveCount(0);
  await expect(statusBar(page)).toContainText('11 items');

  await openEditor(page, '/?seed=20');
  await expect(statusBar(page)).toContainText('20 items');
  await expect(statusBar(page).getByText('Autosave off')).toHaveAttribute(
    'title',
    'Changes in this session are not saved.',
  );
  await listRow(page, 'CAB-01').click();
  await viewportGroup(page).focus();
  await page.keyboard.press('Delete');
  await expect(statusBar(page)).toContainText('19 items');
  await page.reload();
  await expect(statusBar(page), 'the seeded layout comes back unchanged').toContainText('20 items');

  await openEditor(page, '/');
  await expect(statusBar(page)).toContainText('11 items');
  await expect(listRow(page, 'CAB-01')).toContainText(rowPosition({ x: 3.5, z: 1.25 }));
});

test('?seed=10000 opens a generated layout capped at 2,000 items with autosave off, as ?seed=5000 does', async ({
  page,
}) => {
  await page.goto('/?seed=5000');
  await expect(statusBar(page)).toContainText('2,000 items');
  await expect(statusBar(page)).toContainText('Autosave off');

  await page.goto('/?seed=10000');
  await expect(statusBar(page)).toContainText(/\d items/);
  await expect(statusBar(page), 'the documented cap is 2,000 items').toContainText('2,000 items');
  await expect(statusBar(page), 'a seeded session is never saved').toContainText('Autosave off');
});

test('a draft the editor cannot read is kept as a copy before autosave writes the key again', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [DRAFT_KEY, UNREADABLE_DRAFT] as const,
  );
  await page.reload();
  await expect(listRow(page, 'CAB-01')).toBeVisible();
  await expect(listRow(page, 'MINE-00')).toHaveCount(0);

  await listRow(page, 'VFD-01').click();
  await page.keyboard.press('Delete');
  await expect(statusBar(page)).toContainText('Saved');

  const [draft, copy] = await page.evaluate(
    (key) => [localStorage.getItem(key), localStorage.getItem(`${key}:unreadable`)],
    DRAFT_KEY,
  );
  expect(draft).not.toBe(UNREADABLE_DRAFT);
  expect(copy, 'the unreadable draft survives the next save').toBe(UNREADABLE_DRAFT);
});

test(`undo keeps the last ${HISTORY_LIMIT} edits: after ${HISTORY_LIMIT + 1} moves, undo stops one move short of the start`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  const row = listRow(page, 'CAB-01');
  await row.click();
  await viewportGroup(page).focus();
  for (let move = 1; move <= HISTORY_LIMIT + 1; move++) {
    await page.keyboard.press(move % 2 === 1 ? 'ArrowRight' : 'ArrowLeft');
  }
  await expect(row).toContainText(rowPosition({ x: 3.5, z: 1.25 }));
  for (let step = 0; step < HISTORY_LIMIT; step++) await page.keyboard.press('ControlOrMeta+z');
  await expect(undoButton(page)).toBeDisabled();
  await expect(row, 'the oldest move fell out of the history').toContainText(
    rowPosition({ x: 3.5, z: 1.25 }),
  );
  await page.keyboard.press('ControlOrMeta+z');
  await expect(liveRegion(page)).toHaveText('Nothing to undo.');
});
