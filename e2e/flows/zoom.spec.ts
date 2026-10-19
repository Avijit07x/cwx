import type { Locator, Page } from '@playwright/test';
import {
  boxOf,
  cursorReadout,
  expect,
  floorUnderPointer,
  listRow,
  openEditor,
  pointInView,
  readCamera,
  readoutText,
  settledCamera,
  switchToTopView,
  test,
  viewportGroup,
  type CameraReading,
  type ScreenPoint,
} from '../support.ts';

const ROOM = { width: 20, depth: 12 };
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 90;
const ONE_STEP = Math.exp(-0.2);
const ZOOM_HINT = /^Hold (⌘|Ctrl) and scroll to zoom the 3D view$/;

interface PageZoom {
  readonly scale: number | undefined;
  readonly devicePixelRatio: number;
  readonly innerWidth: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

async function pageZoom(page: Page): Promise<PageZoom> {
  return page.evaluate(() => ({
    scale: window.visualViewport?.scale,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
}

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function pinchWithCtrlWheel(page: Page, deltaY: number, events: number): Promise<void> {
  await page.keyboard.down('Control');
  for (let event = 0; event < events; event++) await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
}

async function scrollWheel(page: Page, deltaY: number, notches: number): Promise<void> {
  for (let notch = 0; notch < notches; notch++) await page.mouse.wheel(0, deltaY);
}

async function trackpadPinch(page: Page, at: ScreenPoint, scaleFactor: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.synthesizePinchGesture', {
    x: at.x,
    y: at.y,
    scaleFactor,
    relativeSpeed: 800,
    gestureSourceType: 'mouse',
  });
  await session.detach();
}

async function touchPinch(
  page: Page,
  centre: ScreenPoint,
  fromSpan: number,
  toSpan: number,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const fingers = (span: number) => [
    { x: centre.x - span / 2, y: centre.y, id: 1 },
    { x: centre.x + span / 2, y: centre.y, id: 2 },
  ];
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: fingers(fromSpan),
  });
  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: fingers(fromSpan + ((toSpan - fromSpan) * step) / steps),
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function recordWheel(page: Page) {
  const recorded = await page.evaluateHandle(() => {
    const deltas: number[] = [];
    window.addEventListener(
      'wheel',
      (event) => {
        deltas.push(event.deltaY);
      },
      { capture: true, passive: true },
    );
    return deltas;
  });
  return async (): Promise<string> => {
    const deltas = await recorded.evaluate((values) => values.splice(0));
    const total = deltas.reduce((sum, delta) => sum + delta, 0);
    const largest = deltas.reduce((most, delta) => Math.max(most, Math.abs(delta)), 0);
    return `the page got ${deltas.length} wheel events, largest ${largest.toFixed(1)}, total ${total.toFixed(1)}`;
  };
}

async function recordWheelHandling(page: Page) {
  const recorded = await page.evaluateHandle(() => {
    const cancelled: boolean[] = [];
    window.addEventListener(
      'wheel',
      (event) => {
        cancelled.push(event.defaultPrevented);
      },
      { passive: true },
    );
    return cancelled;
  });
  return async (): Promise<readonly boolean[]> => recorded.evaluate((values) => values.splice(0));
}

function allCancelled(count: number): readonly boolean[] {
  return Array.from({ length: count }, () => true);
}

function expectTargetInRoom(reading: CameraReading, when: string): void {
  expect(reading.x, `camera target inside the room ${when}`).toBeGreaterThanOrEqual(0);
  expect(reading.x, `camera target inside the room ${when}`).toBeLessThanOrEqual(ROOM.width);
  expect(reading.z, `camera target inside the room ${when}`).toBeGreaterThanOrEqual(0);
  expect(reading.z, `camera target inside the room ${when}`).toBeLessThanOrEqual(ROOM.depth);
}

async function expectRoomAtViewCentre(page: Page, canvas: Locator, when: string): Promise<void> {
  const floor = await floorUnderPointer(page, canvas, await pointInView(canvas, 0.5, 0.5));
  expect(floor.x, `the room fills the middle of the view ${when}`).toBeLessThanOrEqual(ROOM.width);
  expect(floor.z, `the room fills the middle of the view ${when}`).toBeLessThanOrEqual(ROOM.depth);
}

async function centreOf(locator: Locator): Promise<ScreenPoint> {
  const box = await boxOf(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pointAt(page: Page, locator: Locator): Promise<void> {
  const centre = await centreOf(locator);
  await page.mouse.move(centre.x, centre.y);
}

test('over the 3D view, Ctrl + wheel (a trackpad pinch) and the mouse wheel zoom the camera both ways, and the page never gets the wheel', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  const pointer = await pointInView(canvas, 0.55, 0.55);
  await page.mouse.move(pointer.x, pointer.y);
  const wheelHandling = await recordWheelHandling(page);

  await pinchWithCtrlWheel(page, -10, 6);
  const pinchedIn = await settledCamera(canvas, start);
  expect(
    pinchedIn.distance / start.distance,
    'six -10 px pinch events zoom by exactly e^-0.6',
  ).toBeCloseTo(Math.exp(-0.6), 2);
  await pinchWithCtrlWheel(page, 10, 6);
  const pinchedOut = await settledCamera(canvas, pinchedIn);
  expect(
    pinchedOut.distance,
    'pinching the fingers together moves the camera away',
  ).toBeGreaterThan(pinchedIn.distance);

  await scrollWheel(page, -100, 2);
  const wheeledIn = await settledCamera(canvas, pinchedOut);
  expect(wheeledIn.distance / pinchedOut.distance, 'two wheel notches zoom two steps').toBeCloseTo(
    ONE_STEP ** 2,
    2,
  );
  await scrollWheel(page, 100, 2);
  const wheeledOut = await settledCamera(canvas, wheeledIn);
  expect(wheeledOut.distance, 'scrolling down moves the camera away').toBeGreaterThan(
    wheeledIn.distance,
  );
  expect(
    await wheelHandling(),
    'every wheel event over the view is cancelled, so the page never scrolls or zooms',
  ).toEqual(allCancelled(16));

  await pointAt(page, page.getByRole('radio', { name: 'Top' }));
  await pinchWithCtrlWheel(page, -10, 2);
  expect(
    await wheelHandling(),
    'Ctrl + wheel over the view controls is cancelled too, so it cannot zoom the page',
  ).toEqual(allCancelled(2));
  expect(await settledCamera(canvas), 'and it leaves the camera alone').toEqual(wheeledOut);
});

async function pinchZoomsTheViewNotThePage(page: Page): Promise<void> {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  const zoomBefore = await pageZoom(page);
  const fingers = await pointInView(canvas, 0.4, 0.6);
  const floorBefore = await floorUnderPointer(page, canvas, fingers);
  const wheelEvents = await recordWheel(page);

  await trackpadPinch(page, fingers, 2);
  const zoomedIn = await settledCamera(canvas, start);
  expect(
    zoomedIn.distance / start.distance,
    `a 2x pinch halves the distance (${await wheelEvents()})`,
  ).toBeCloseTo(0.5, 2);
  expect(
    await floorUnderPointer(page, canvas, fingers),
    'the floor under the fingers stays put',
  ).toEqual(floorBefore);
  expect(await pageZoom(page), 'the page does not zoom').toEqual(zoomBefore);

  await trackpadPinch(page, fingers, 0.5);
  const zoomedOut = await settledCamera(canvas, zoomedIn);
  expect(zoomedOut.distance, 'pinching in zooms back out').toBeGreaterThan(zoomedIn.distance);
  expectTargetInRoom(zoomedOut, 'after pinching');
  expect(await pageZoom(page), 'the page does not zoom').toEqual(zoomBefore);

  await trackpadPinch(page, await centreOf(page.getByRole('group', { name: 'View controls' })), 2);
  expect(await pageZoom(page), 'a pinch over the view controls does not zoom the page').toEqual(
    zoomBefore,
  );
  expect(await readCamera(canvas), 'a pinch over the view controls leaves the camera').toEqual(
    zoomedOut,
  );
}

test('a real trackpad pinch zooms the 3D view toward the fingers, and a pinch over the view controls zooms nothing', async ({
  page,
}) => {
  await pinchZoomsTheViewNotThePage(page);
});

test('on a Retina screen (device scale factor 2) a real trackpad pinch also follows the fingers', async ({
  playwright,
  baseURL,
}) => {
  test.slow();
  const browser = await playwright.chromium.launch({
    args: ['--force-device-scale-factor=2', '--window-size=1920,1080'],
  });
  try {
    const page = await browser.newPage({ viewport: null, baseURL });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    await pinchZoomsTheViewNotThePage(page);
  } finally {
    await browser.close();
  }
});

test('with 500 items placed, a real 2x trackpad pinch still halves the distance', async ({
  page,
}) => {
  test.slow();
  const canvas = await openEditor(page, '/?seed=500');
  await expect(page.getByRole('contentinfo', { name: 'Status' })).toContainText('500 items');
  const start = await settledCamera(canvas);
  const fingers = await pointInView(canvas, 0.4, 0.6);
  await page.mouse.move(fingers.x, fingers.y);
  const wheelEvents = await recordWheel(page);

  await trackpadPinch(page, fingers, 2);
  const zoomedIn = await settledCamera(canvas, start);
  expect(
    zoomedIn.distance / start.distance,
    `the camera keeps up with the fingers in a busy scene (${await wheelEvents()})`,
  ).toBeCloseTo(0.5, 2);
  expect(await pageZoom(page)).toMatchObject({ scale: 1 });
});

test('a trackpad pinch over the performance overlay zooms neither the page nor the camera', async ({
  page,
}) => {
  const canvas = await openEditor(page, '/?perf=1');
  const overlay = page.getByRole('region', { name: 'Performance' });
  await expect(overlay).toBeVisible();
  const start = await settledCamera(canvas);
  const zoomBefore = await pageZoom(page);

  await trackpadPinch(page, await centreOf(overlay), 2);
  expect(await pageZoom(page), 'the page does not zoom').toEqual(zoomBefore);
  expect(await settledCamera(canvas), 'the camera does not move').toEqual(start);
});

test('Safari trackpad pinch gestures zoom the 3D view, and are cancelled so Safari cannot zoom the page', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  const centre = await pointInView(canvas, 0.5, 0.5);

  const cancelled = await canvas.evaluate((element, at) => {
    const gesture = (type: string, scale: number) => {
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        scale,
        clientX: at.x,
        clientY: at.y,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return [
      gesture('gesturestart', 1),
      gesture('gesturechange', 1.5),
      gesture('gesturechange', 2),
      gesture('gestureend', 2),
    ];
  }, centre);
  expect(cancelled, 'every gesture event over the 3D view is cancelled').toEqual(allCancelled(4));
  const zoomed = await settledCamera(canvas, start);
  expect(zoomed.distance / start.distance, 'a 2x gesture halves the distance').toBeCloseTo(0.5, 2);

  const overControls = await page
    .getByRole('group', { name: 'View controls' })
    .evaluate((element) => {
      const event = new Event('gesturechange', { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(overControls, 'a gesture over the view controls is cancelled too').toBe(true);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('spreading two fingers to twice their distance halves the camera distance toward the fingers, however far apart they start', async ({
    page,
  }) => {
    const canvas = await openEditor(page, '/?seed=0');
    let previous = await settledCamera(canvas);
    for (const { fx, fy, span } of [
      { fx: 0.5, fy: 0.5, span: 100 },
      { fx: 0.3, fy: 0.65, span: 300 },
    ]) {
      const centre = await pointInView(canvas, fx, fy);
      const floorBefore = await floorUnderPointer(page, canvas, centre);
      await touchPinch(page, centre, span, span * 2);
      const zoomed = await settledCamera(canvas, previous);
      expect(
        zoomed.distance / previous.distance,
        `spreading the fingers from ${span} to ${span * 2} px halves the distance`,
      ).toBeCloseTo(0.5, 2);
      expect(
        await floorUnderPointer(page, canvas, centre),
        'the floor between the fingers stays put',
      ).toEqual(floorBefore);
      previous = zoomed;
    }
    expect(await pageZoom(page)).toMatchObject({ scale: 1 });
  });
});

test('the keyboard zooms the 3D view with the zoom buttons and with the + and - keys', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);

  await page.getByRole('button', { name: 'Zoom in' }).focus();
  await page.keyboard.press('Enter');
  const buttonIn = await settledCamera(canvas, start);
  expect(buttonIn.distance / start.distance, 'Zoom in moves one wheel step closer').toBeCloseTo(
    ONE_STEP,
    2,
  );
  await expect(
    page.getByRole('radio', { name: '3D' }),
    'the view is free after zooming',
  ).not.toBeChecked();

  await page.getByRole('button', { name: 'Zoom out' }).focus();
  await page.keyboard.press('Space');
  const buttonOut = await settledCamera(canvas, buttonIn);
  expect(buttonOut.distance, 'Zoom out moves the same step back').toBeCloseTo(start.distance, 1);

  await viewportGroup(page).focus();
  await page.keyboard.press('+');
  const plus = await settledCamera(canvas, buttonOut);
  expect(plus.distance / buttonOut.distance, '+ zooms in one step').toBeCloseTo(ONE_STEP, 2);
  await page.keyboard.press('-');
  const minus = await settledCamera(canvas, plus);
  expect(minus.distance / plus.distance, '- zooms out one step').toBeCloseTo(1 / ONE_STEP, 2);
  await page.keyboard.press('=');
  const equals = await settledCamera(canvas, minus);
  expect(equals.distance / minus.distance, '= zooms in like +').toBeCloseTo(ONE_STEP, 2);
});

test('the mouse wheel zooms in comfortable steps between fixed limits, and zooming out recentres the room', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  const corner = await pointInView(canvas, 0.9, 0.15);
  await page.mouse.move(corner.x, corner.y);

  await scrollWheel(page, -100, 1);
  const oneNotch = await settledCamera(canvas, start);
  expect(oneNotch.distance / start.distance, 'one notch is one step').toBeCloseTo(ONE_STEP, 2);

  await scrollWheel(page, -100, 30);
  const closest = await settledCamera(canvas, oneNotch);
  expect(closest.distance, 'the camera stops at the closest distance').toBe(MIN_DISTANCE);
  expectTargetInRoom(closest, 'at the closest distance');

  await scrollWheel(page, 100, 40);
  const furthest = await settledCamera(canvas, closest);
  expect(furthest.distance, 'the camera stops at the furthest distance').toBe(MAX_DISTANCE);
  expect(furthest, 'zooming all the way out recentres the room').toMatchObject({
    x: start.x,
    z: start.z,
  });
});

test('the room stays in view through repeated zooming in and out anywhere over the 3D view', async ({
  page,
}) => {
  test.slow();
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  let previous = start;
  const spots: readonly (readonly [number, number])[] = [
    [0.08, 0.1],
    [0.92, 0.12],
    [0.1, 0.92],
    [0.9, 0.9],
    [0.5, 0.5],
  ];

  for (const [fx, fy] of spots) {
    const where = `at ${fx}, ${fy} of the view`;
    const spot = await pointInView(canvas, fx, fy);
    await page.mouse.move(spot.x, spot.y);
    await scrollWheel(page, -100, 12);
    await pinchWithCtrlWheel(page, -10, 10);
    const zoomedIn = await settledCamera(canvas, previous);
    expect(zoomedIn.distance, `zoomed in ${where}`).toBeLessThan(previous.distance);
    expectTargetInRoom(zoomedIn, `after zooming in ${where}`);
    await expectRoomAtViewCentre(page, canvas, `after zooming in ${where}`);

    await page.mouse.move(spot.x, spot.y);
    await scrollWheel(page, 100, 6);
    await pinchWithCtrlWheel(page, 10, 5);
    const zoomedOut = await settledCamera(canvas, zoomedIn);
    expect(zoomedOut.distance, `zoomed out ${where}`).toBeGreaterThan(zoomedIn.distance);
    expectTargetInRoom(zoomedOut, `after zooming out ${where}`);
    await expectRoomAtViewCentre(page, canvas, `after zooming out ${where}`);
    previous = zoomedOut;
  }

  await scrollWheel(page, 100, 30);
  const furthest = await settledCamera(canvas, previous);
  expect(
    furthest,
    'zooming all the way out brings the whole room back to the centre',
  ).toMatchObject({
    x: start.x,
    z: start.z,
  });
  expect(furthest.distance).toBeGreaterThan(start.distance);
  expect(await pageZoom(page)).toMatchObject({ scale: 1, scrollY: 0 });
});

test('after any zooming, the 3D and Top views frame the whole room again', async ({ page }) => {
  test.slow();
  const canvas = await openEditor(page);
  const perspective = await settledCamera(canvas);
  const toScreen = await switchToTopView(page, canvas);
  const top = await readCamera(canvas);
  const threeD = page.getByRole('radio', { name: '3D' });
  const plan = page.getByRole('radio', { name: 'Top' });
  await threeD.click();
  expect(await settledCamera(canvas, top)).toEqual(perspective);

  const corner = await pointInView(canvas, 0.15, 0.85);
  await page.mouse.move(corner.x, corner.y);
  await scrollWheel(page, -100, 20);
  await pinchWithCtrlWheel(page, -10, 8);
  await scrollWheel(page, 100, 3);
  const zoomed = await settledCamera(canvas, perspective);
  await expect(threeD, 'the view is free after zooming').not.toBeChecked();

  await plan.click();
  expect(await settledCamera(canvas, zoomed), 'Top returns to the plan framing').toEqual(top);
  for (const roomCorner of [
    { x: 0.4, z: 0.4 },
    { x: 19.6, z: 0.4 },
    { x: 19.6, z: 11.6 },
    { x: 0.4, z: 11.6 },
  ]) {
    const at = toScreen(roomCorner);
    await page.mouse.move(at.x, at.y);
    await expect(cursorReadout(page), 'every room corner is on screen in the Top view').toHaveText(
      readoutText({ x: Math.round(roomCorner.x * 2) / 2, z: Math.round(roomCorner.z * 2) / 2 }),
    );
  }

  const middle = await pointInView(canvas, 0.6, 0.4);
  await page.mouse.move(middle.x, middle.y);
  await scrollWheel(page, -100, 15);
  const planZoomed = await settledCamera(canvas, top);
  await threeD.click();
  expect(await settledCamera(canvas, planZoomed), '3D returns to the room framing').toEqual(
    perspective,
  );
  await expectRoomAtViewCentre(page, canvas, 'in the 3D view after zooming');
  expect(await pageZoom(page)).toMatchObject({ scale: 1, scrollY: 0 });
});

test('Focus still centres the selected item after zooming into a corner', async ({ page }) => {
  const canvas = await openEditor(page);
  const start = await settledCamera(canvas);
  const corner = await pointInView(canvas, 0.15, 0.85);
  await page.mouse.move(corner.x, corner.y);
  await scrollWheel(page, -100, 8);
  const zoomed = await settledCamera(canvas, start);

  await listRow(page, 'UPS-02').click();
  await page.getByRole('button', { name: 'Focus selection' }).click();
  expect(await settledCamera(canvas, zoomed)).toMatchObject({ x: 12.5, z: 9.5 });
});

test('the Turn view buttons orbit the camera by 45° without dragging, and the view no longer matches a preset', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const azimuth = async () => (await settledCamera(canvas)).azimuth;
  const presets = page.getByRole('radiogroup', { name: 'Camera view' });
  await expect(presets.getByRole('radio', { name: '3D' })).toBeChecked();
  const start = await settledCamera(canvas);

  await page.getByRole('button', { name: 'Turn view right', exact: true }).click();
  await expect.poll(azimuth).toBeCloseTo(start.azimuth + 45, 0);
  await expect(presets.getByRole('radio', { checked: true })).toHaveCount(0);
  expect(await settledCamera(canvas)).toMatchObject({
    distance: start.distance,
    x: start.x,
    z: start.z,
  });

  await page.getByRole('button', { name: 'Turn view left', exact: true }).click();
  await page.getByRole('button', { name: 'Turn view left', exact: true }).click();
  await expect.poll(azimuth).toBeCloseTo(start.azimuth - 45, 0);

  await presets.getByRole('radio', { name: '3D' }).click();
  await expect(presets.getByRole('radio', { name: '3D' })).toBeChecked();
  await expect.poll(azimuth).toBeCloseTo(start.azimuth, 0);
});

test('in the narrow stacked layout the 3D view never fills the window, the wheel scrolls the page past it and Ctrl + wheel zooms it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 256 });
  const canvas = await openEditor(page);
  const view = viewportGroup(page);
  expect(
    (await boxOf(view)).height,
    'part of the window stays free to scroll the page',
  ).toBeLessThan(256);
  await view.scrollIntoViewIfNeeded();
  const start = await settledCamera(canvas);
  const scrollBefore = await pageScrollY(page);

  await pointAt(page, view);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(() => pageScrollY(page), { message: 'a plain wheel over the 3D view scrolls the page' })
    .toBeGreaterThan(scrollBefore);
  await expect(page.getByText(ZOOM_HINT), 'a hint says how to zoom instead').toBeVisible();
  expect(await settledCamera(canvas), 'the plain wheel leaves the camera alone').toEqual(start);

  await view.scrollIntoViewIfNeeded();
  const scrolled = await pageScrollY(page);
  await pointAt(page, view);
  await pinchWithCtrlWheel(page, -20, 3);
  const zoomed = await settledCamera(canvas, start);
  expect(zoomed.distance, 'Ctrl + wheel zooms the camera').toBeLessThan(start.distance);
  expect(await pageScrollY(page), 'and does not scroll the page').toBe(scrolled);
});
