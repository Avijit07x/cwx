import type { Page } from '@playwright/test';
import {
  boxOf,
  cursorReadout,
  expect,
  floorUnderPointer,
  liveRegion,
  listRow,
  openEditor,
  paletteCard,
  placementBanner,
  pointInView,
  propertiesPanel,
  readCamera,
  readoutText,
  redoButton,
  rotationChoice,
  rowPosition,
  selectedRows,
  selectionLabel,
  settledCamera,
  statusBar,
  switchToTopView,
  test,
  undoButton,
  type ScreenPoint,
} from '../support.ts';

const LABEL_LIFT = 0.12;
const TRANSFORMER = { x: 15.75, z: 2.5, height: 1.8 };
const UPS_02 = { x: 12.5, z: 9.5, height: 1.6 };

async function expectSelectionLabelAbove(page: Page, tag: string, anchor: ScreenPoint) {
  const label = selectionLabel(page, tag);
  await expect(label, `the 3D view labels ${tag} as selected`).toBeVisible();
  const box = await boxOf(label);
  expect(Math.abs(box.x + box.width / 2 - anchor.x), 'label centred over the item').toBeLessThan(4);
  expect(box.y + box.height, 'label sits above the item').toBeLessThanOrEqual(anchor.y);
  expect(box.y + box.height, 'label stays close to the item').toBeGreaterThan(anchor.y - 8);
}

test('a palette card, then a click on empty floor, places one item that a single undo removes', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  await settledCamera(canvas);
  await expect(undoButton(page)).toBeDisabled();
  await expect(statusBar(page)).toContainText('12 items');

  const ups = paletteCard(page, 'UPS');
  await ups.click();
  await expect(ups).toHaveAttribute('aria-pressed', 'true');
  await expect(placementBanner(page, 'UPS unit')).toBeVisible();

  const emptyFloor = await pointInView(canvas, 0.5, 0.5);
  const floor = await floorUnderPointer(page, canvas, emptyFloor);
  await page.mouse.click(emptyFloor.x, emptyFloor.y);

  const placed = listRow(page, 'UPS-03');
  await expect(placed).toContainText(rowPosition(floor));
  await expect(placed).toHaveAttribute('aria-selected', 'true');
  await expect(ups).toHaveAttribute('aria-pressed', 'false');
  await expect(placementBanner(page, 'UPS unit')).toBeHidden();
  await expect(statusBar(page)).toContainText('13 items');
  await expect(liveRegion(page)).toContainText(
    `Placed UPS-03 at X ${floor.x.toFixed(2)} m, Z ${floor.z.toFixed(2)} m.`,
  );
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Add UPS-03');

  await undoButton(page).click();
  await expect(placed).toHaveCount(0);
  await expect(statusBar(page)).toContainText('12 items');
  await expect(undoButton(page), 'placing took exactly one undo step').toBeDisabled();
  await expect(redoButton(page)).toHaveAccessibleName('Redo: Add UPS-03');
});

test('clicking an item in the 3D view selects it, and the list, properties and label follow', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const transformer = toScreen(TRANSFORMER);

  await page.mouse.move(transformer.x, transformer.y);
  await expect(listRow(page, 'TR-01')).toHaveAttribute('data-hovered', 'true');
  await page.mouse.click(transformer.x, transformer.y);

  await expect(listRow(page, 'TR-01')).toHaveAttribute('aria-selected', 'true');
  await expect(selectedRows(page)).toHaveCount(1);
  const properties = propertiesPanel(page);
  await expect(properties.getByRole('heading', { level: 3 })).toHaveText('TR-01');
  await expect(properties.getByText('Dry-type transformer')).toBeVisible();
  await expect(properties.getByLabel('Tag')).toHaveValue('TR-01');
  await expect(properties.getByLabel('X', { exact: true })).toHaveValue('15.75');
  await expect(properties.getByLabel('Z', { exact: true })).toHaveValue('2.50');
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(liveRegion(page)).toContainText(
    'Selected TR-01, Dry-type transformer, at X 15.75 m, Z 2.50 m.',
  );
  await expectSelectionLabelAbove(
    page,
    'TR-01',
    toScreen(TRANSFORMER, TRANSFORMER.height + LABEL_LIFT),
  );

  const emptyFloor = toScreen({ x: 10, z: 6 });
  await page.mouse.click(emptyFloor.x, emptyFloor.y);
  await expect(selectedRows(page)).toHaveCount(0);
  await expect(properties.getByText('No item selected')).toBeVisible();
  await expect(liveRegion(page)).toHaveText('Selection cleared.');
  await expect(selectionLabel(page, 'TR-01')).toHaveCount(0);
});

test('selecting in the list selects in the 3D view, where the label and the camera follow', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const focus = page.getByRole('button', { name: 'Focus selection' });
  await expect(focus).toBeDisabled();

  await listRow(page, 'UPS-02').click();
  await expect(listRow(page, 'UPS-02')).toHaveAttribute('aria-selected', 'true');
  await expect(propertiesPanel(page).getByRole('heading', { level: 3 })).toHaveText('UPS-02');
  await expect(propertiesPanel(page).getByLabel('X', { exact: true })).toHaveValue('12.50');
  await expectSelectionLabelAbove(page, 'UPS-02', toScreen(UPS_02, UPS_02.height + LABEL_LIFT));
  await expect(focus).toBeEnabled();

  const before = await readCamera(canvas);
  await focus.click();
  expect(await settledCamera(canvas, before)).toMatchObject({ x: UPS_02.x, z: UPS_02.z });

  await listRow(page, 'TR-02').click();
  await expect(selectionLabel(page, 'TR-02')).toBeVisible();
  await expect(selectionLabel(page, 'UPS-02')).toHaveCount(0);
});

test('dragging an item moves it cell by cell, snaps it to the grid and takes one undo step', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const cameraBefore = await readCamera(canvas);
  const row = listRow(page, 'UPS-02');
  await expect(row).toContainText(rowPosition(UPS_02));
  const clearBanner = page.getByText('Clear of other items (minimum 0.60 m)');

  const grab = toScreen(UPS_02);
  await page.mouse.move(grab.x, grab.y);
  await expect(row).toHaveAttribute('data-hovered', 'true');
  await page.mouse.down();
  const midway = toScreen({ x: 13.4, z: 8.6 });
  await page.mouse.move(midway.x, midway.y, { steps: 8 });
  await expect(row, 'the drag preview snaps to the grid').toContainText(
    rowPosition({ x: 13.5, z: 8.5 }),
  );
  await expect(clearBanner).toBeVisible();
  const release = toScreen({ x: 14.6, z: 6.9 });
  await page.mouse.move(release.x, release.y, { steps: 8 });
  await expect(row).toContainText(rowPosition({ x: 14.5, z: 7 }));
  await page.mouse.up();

  await expect(clearBanner).toBeHidden();
  await expect(row).toContainText(rowPosition({ x: 14.5, z: 7 }));
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(propertiesPanel(page).getByLabel('X', { exact: true })).toHaveValue('14.50');
  await expect(propertiesPanel(page).getByLabel('Z', { exact: true })).toHaveValue('7.00');
  await expect(liveRegion(page)).toContainText('UPS-02 moved to X 14.50 m, Z 7.00 m.');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move UPS-02');
  expect(await readCamera(canvas), 'the camera stays put while an item is dragged').toEqual(
    cameraBefore,
  );
  await expect(cursorReadout(page)).toHaveText(readoutText({ x: 14.5, z: 7 }));

  await undoButton(page).click();
  await expect(row).toContainText(rowPosition(UPS_02));
  await expect(undoButton(page), 'the whole drag was one undo step').toBeDisabled();
  await expect(redoButton(page)).toHaveAccessibleName('Redo: Move UPS-02');
});

test('dragging past the wall and letting go outside the 3D view clamps the item at the wall and leaves the view working', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const view = await boxOf(canvas);
  const row = listRow(page, 'TR-01');

  const grab = toScreen(TRANSFORMER);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const besideUps = toScreen({ x: 18.6, z: 2.6 });
  await page.mouse.move(besideUps.x, besideUps.y, { steps: 6 });
  await expect(
    page.getByRole('main').getByText(/^TR-01 and UPS-01 /),
    'the drag banner names the clearance problem live',
  ).toBeVisible();
  const outside = toScreen({ x: 27, z: 2.6 });
  expect(outside.x, 'the pointer leaves the 3D view').toBeGreaterThan(view.x + view.width);
  await page.mouse.move(outside.x, outside.y, { steps: 6 });
  await expect(row, 'the item stops at the east wall').toContainText(
    rowPosition({ x: 19.25, z: 2.5 }),
  );
  await page.mouse.up();

  await expect(row).toContainText(rowPosition({ x: 19.25, z: 2.5 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move TR-01');
  const before = await readCamera(canvas);
  const centre = await pointInView(canvas, 0.5, 0.5);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -100);
  expect(
    (await settledCamera(canvas, before)).distance,
    'the view still zooms after the drag ended outside it',
  ).toBeLessThan(before.distance);

  await undoButton(page).click();
  await expect(row).toContainText(rowPosition(TRANSFORMER));
  await expect(undoButton(page), 'the drag was one undo step').toBeDisabled();
});

test('during a drag, Escape cancels the move, R turns the item and Ctrl+Z only cancels the drag', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const ups = listRow(page, 'UPS-02');
  const grabUps = toScreen(UPS_02);

  await page.mouse.move(grabUps.x, grabUps.y);
  await page.mouse.down();
  const away = toScreen({ x: 15, z: 7 });
  await page.mouse.move(away.x, away.y, { steps: 6 });
  await expect(ups).toContainText(rowPosition({ x: 15, z: 7 }));
  await page.keyboard.press('Escape');
  await expect(ups, 'Escape puts the item back').toContainText(rowPosition(UPS_02));
  await expect(liveRegion(page)).toHaveText('Move cancelled.');
  const further = toScreen({ x: 16, z: 6 });
  await page.mouse.move(further.x, further.y, { steps: 4 });
  await page.mouse.up();
  await expect(ups).toContainText(rowPosition(UPS_02));
  await expect(undoButton(page), 'a cancelled drag leaves no undo step').toBeDisabled();

  const cabinet = listRow(page, 'CAB-04');
  const grabCabinet = toScreen({ x: 9, z: 1.25 });
  await page.mouse.move(grabCabinet.x, grabCabinet.y);
  await page.mouse.down();
  const open = toScreen({ x: 11, z: 3.25 });
  await page.mouse.move(open.x, open.y, { steps: 6 });
  await expect(cabinet).toContainText(rowPosition({ x: 11, z: 3.25 }));
  await page.keyboard.press('r');
  await expect(rotationChoice(page, 90), 'R turns the item being dragged').toBeChecked();
  await page.mouse.up();
  await expect(rotationChoice(page, 90)).toBeChecked();
  await expect(propertiesPanel(page)).toContainText('0.50 m × 1.00 m × 2.00 m');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move CAB-04');
  await undoButton(page).click();
  await expect(rotationChoice(page, 0)).toBeChecked();
  await expect(cabinet).toContainText(rowPosition({ x: 9, z: 1.25 }));
  await expect(undoButton(page), 'the turned drag was one undo step').toBeDisabled();

  await page.mouse.move(grabUps.x, grabUps.y);
  await page.mouse.down();
  const oneCellEast = toScreen({ x: 13, z: 9.5 });
  await page.mouse.move(oneCellEast.x, oneCellEast.y, { steps: 4 });
  await page.mouse.up();
  await expect(ups).toContainText(rowPosition({ x: 13, z: 9.5 }));
  await page.mouse.move(oneCellEast.x, oneCellEast.y);
  await page.mouse.down();
  const twoCellsSouth = toScreen({ x: 13, z: 10.5 });
  await page.mouse.move(twoCellsSouth.x, twoCellsSouth.y, { steps: 4 });
  await expect(ups).toContainText(rowPosition({ x: 13, z: 10.5 }));
  await page.keyboard.press('Control+z');
  await expect(ups, 'Ctrl+Z during a drag cancels only the drag').toContainText(
    rowPosition({ x: 13, z: 9.5 }),
  );
  await page.mouse.up();
  await expect(ups).toContainText(rowPosition({ x: 13, z: 9.5 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move UPS-02');
});
