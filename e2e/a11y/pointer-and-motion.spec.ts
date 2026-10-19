import type { Page } from '@playwright/test';
import {
  EDITOR_STATES,
  expect,
  itemList,
  openEditor,
  settledCamera,
  test,
  THREE_CANVAS,
  viewportGroup,
} from '../support.ts';

const MIN_TARGET_PX = 24;

function findCrowdedSmallTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate((minimum) => {
    const interactive =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="slider"], [tabindex]:not([tabindex="-1"])';
    const targets = [...document.querySelectorAll(interactive)].filter((element) => {
      if (element.closest('[aria-hidden="true"], [inert], [data-base-ui-focus-guard]'))
        return false;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || !element.checkVisibility()) return false;
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit !== null && element.contains(hit);
    });
    const rects = targets.map((element) => element.getBoundingClientRect());
    const isSmall = rects.map((rect) => rect.width < minimum || rect.height < minimum);
    const radius = minimum / 2;
    return targets.flatMap((element, index) => {
      const rect = rects[index];
      if (!rect || isSmall[index] !== true) return [];
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const crowded = targets.some((other, otherIndex) => {
        const otherRect = rects[otherIndex];
        if (otherIndex === index || !otherRect) return false;
        if (other.contains(element) || element.contains(other)) return false;
        const dx = Math.max(otherRect.left - cx, 0, cx - otherRect.right);
        const dy = Math.max(otherRect.top - cy, 0, cy - otherRect.bottom);
        const touchesTarget = Math.hypot(dx, dy) < radius;
        const otherCx = otherRect.x + otherRect.width / 2;
        const otherCy = otherRect.y + otherRect.height / 2;
        const touchesCircle =
          isSmall[otherIndex] === true && Math.hypot(otherCx - cx, otherCy - cy) < minimum;
        return touchesTarget || touchesCircle;
      });
      if (!crowded) return [];
      const name = element.getAttribute('aria-label') ?? element.textContent.trim();
      return [
        `${element.tagName.toLowerCase()} "${name.slice(0, 40)}" ${Math.round(rect.width)}×${Math.round(rect.height)} px`,
      ];
    });
  }, MIN_TARGET_PX);
}

for (const state of EDITOR_STATES) {
  test(`every pointer target is at least 24 × 24 px or spaced as WCAG 2.5.8 allows: ${state.name}`, async ({
    page,
  }) => {
    await openEditor(page);
    await state.enter(page);
    expect(await findCrowdedSmallTargets(page)).toEqual([]);
  });
}

async function recordCameraWrites(page: Page): Promise<void> {
  await page.locator(THREE_CANVAS).evaluate((canvas) => {
    const root = document.documentElement;
    root.dataset.cameraLog = '';
    new MutationObserver(() => {
      const reading = `${canvas.getAttribute('data-camera-distance') ?? ''} ${canvas.getAttribute('data-camera-target') ?? ''}`;
      root.dataset.cameraLog = `${root.dataset.cameraLog ?? ''}${reading};`;
    }).observe(canvas, {
      attributes: true,
      attributeFilter: ['data-camera-distance', 'data-camera-target'],
    });
  });
}

async function readCameraLog(page: Page): Promise<readonly string[]> {
  const log = await page.evaluate(() => document.documentElement.dataset.cameraLog ?? '');
  return log.split(';').filter((reading) => reading !== '');
}

async function cameraFramesDuring(page: Page, action: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    document.documentElement.dataset.cameraLog = '';
  });
  await action();
  let previousLength = -1;
  await expect
    .poll(
      async () => {
        const { length } = await readCameraLog(page);
        const settled = length > 0 && length === previousLength;
        previousLength = length;
        return settled;
      },
      { intervals: [400], timeout: 10_000 },
    )
    .toBe(true);
  const readings = await readCameraLog(page);
  return readings.filter((reading, index) => reading !== readings[index - 1]).length;
}

interface CameraMove {
  readonly name: string;
  readonly run: (page: Page) => Promise<void>;
}

interface MeasuredMove {
  readonly name: string;
  readonly frames: number;
}

const PRESET_AND_FOCUS_MOVES: readonly CameraMove[] = [
  { name: 'Top view', run: (page) => page.getByRole('radio', { name: 'Top' }).click() },
  { name: '3D view', run: (page) => page.getByRole('radio', { name: '3D' }).click() },
  {
    name: 'Focus selection button',
    run: (page) => page.getByRole('button', { name: 'Focus selection' }).click(),
  },
  { name: 'Top view again', run: (page) => page.getByRole('radio', { name: 'Top' }).click() },
  {
    name: 'F key in the 3D view',
    run: async (page) => {
      await viewportGroup(page).focus();
      await page.keyboard.press('f');
    },
  },
];

async function pointAtViewCentre(page: Page): Promise<void> {
  const box = await page.locator(THREE_CANVAS).boundingBox();
  if (!box) throw new Error('The 3D view has no size');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
}

const ZOOM_MOVES: readonly CameraMove[] = [
  {
    name: 'one mouse-wheel notch',
    run: async (page) => {
      await pointAtViewCentre(page);
      await page.mouse.wheel(0, -100);
    },
  },
  {
    name: 'a trackpad pinch (Ctrl + wheel)',
    run: async (page) => {
      await pointAtViewCentre(page);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -20);
      await page.keyboard.up('Control');
    },
  },
];

async function measureMoves(
  page: Page,
  moves: readonly CameraMove[],
): Promise<readonly MeasuredMove[]> {
  await openEditor(page);
  await itemList(page)
    .getByRole('option', { name: /CAB-01/ })
    .click();
  await recordCameraWrites(page);
  const measured: MeasuredMove[] = [];
  for (const { name, run } of moves) {
    measured.push({ name, frames: await cameraFramesDuring(page, () => run(page)) });
  }
  console.log(measured.map(({ name, frames }) => `${name}: ${frames} camera frames`).join('\n'));
  return measured;
}

function inOneJump(moves: readonly CameraMove[]): readonly MeasuredMove[] {
  return moves.map(({ name }) => ({ name, frames: 1 }));
}

test.describe('with prefers-reduced-motion: reduce', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the 3D and Top views and focus move the camera in one jump', async ({ page }) => {
    expect(await measureMoves(page, PRESET_AND_FOCUS_MOVES)).toEqual(
      inOneJump(PRESET_AND_FOCUS_MOVES),
    );
  });

  test('wheel and trackpad-pinch zoom move the camera in one jump', async ({ page }) => {
    expect(await measureMoves(page, ZOOM_MOVES)).toEqual(inOneJump(ZOOM_MOVES));
  });

  test('Turn view moves the camera to the new angle in one jump', async ({ page }) => {
    const canvas = await openEditor(page);
    const azimuth = async () => (await settledCamera(canvas)).azimuth;
    const start = await azimuth();
    await canvas.evaluate((element) => {
      const root = document.documentElement;
      root.dataset.azimuthLog = '';
      new MutationObserver(() => {
        root.dataset.azimuthLog = `${root.dataset.azimuthLog ?? ''}${element.dataset.cameraAzimuth ?? ''};`;
      }).observe(element, { attributeFilter: ['data-camera-azimuth'] });
    });

    await page.getByRole('button', { name: 'Turn view right', exact: true }).click();
    await expect.poll(azimuth).toBeCloseTo(start + 45, 0);
    const writes = (await page.evaluate(() => document.documentElement.dataset.azimuthLog ?? ''))
      .split(';')
      .filter((reading) => reading !== '');
    expect(writes).toHaveLength(1);
    expect(Number(writes[0])).toBeCloseTo(start + 45, 0);
  });
});

test('without a reduced-motion preference the same camera moves animate, so the reduced-motion checks can see animation', async ({
  page,
}) => {
  const measured = await measureMoves(page, [...PRESET_AND_FOCUS_MOVES, ...ZOOM_MOVES]);
  for (const { name, frames } of measured) {
    expect(frames, name).toBeGreaterThan(2);
  }
});
