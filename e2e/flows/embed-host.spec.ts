import type { FrameLocator, Locator, Page } from '@playwright/test';
import {
  boxOf,
  EDITOR_ORIGIN,
  expect,
  FIRST_RENDER_TIMEOUT_MS,
  HOST_ORIGIN,
  itemList,
  openEditor,
  openHost,
  seriousAxeViolations,
  test,
  waitForView,
  type Box,
} from '../support.ts';

const HOST_ACCENT = [0x0b, 0x6a, 0xa2] as const;
const APP_ACCENT = [0x23, 0x57, 0xd9] as const;
const ACCENT_TOLERANCE = 12;
const ACCENT_DRAWN = 40;

const DRAFT_KEY = 'layout-editor:v1:draft:demo';
const STACKED_WIDTH = 800;
const FIRST_FRAME_HEIGHT = 600;
const HOST_ROUNDS = 4;

const GRID_DRAFT = JSON.stringify({
  version: 1,
  items: Array.from({ length: 200 }, (_, index) => ({
    id: `grid-${String(index)}`,
    kind: 'drive',
    tag: `GRID-${String(index).padStart(3, '0')}`,
    x: 0.25 + (index % 20),
    z: 0.25 + Math.floor(index / 20),
    rotation: 0,
  })),
});

interface LogEntry {
  readonly direction: string;
  readonly type: string;
  readonly detail: string;
}

interface AccentPixels {
  readonly host: number;
  readonly app: number;
}

function messageLog(page: Page): Locator {
  return page.locator('#message-log');
}

async function logEntries(page: Page): Promise<LogEntry[]> {
  const entries = await messageLog(page)
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => ({
        direction: item.getAttribute('data-direction') ?? '',
        type: item.getAttribute('data-type') ?? '',
        detail: item.querySelector('code')?.textContent ?? '',
      })),
    );
  return entries.reverse();
}

async function received(page: Page, type: string): Promise<LogEntry[]> {
  return (await logEntries(page)).filter(
    (entry) => entry.direction === 'received' && entry.type === type,
  );
}

async function openConnectedEditor(page: Page): Promise<FrameLocator> {
  const editor = await openHost(page);
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible({
    timeout: FIRST_RENDER_TIMEOUT_MS,
  });
  return editor;
}

function hostBom(page: Page): Locator {
  return page.getByRole('region', { name: 'Bill of materials' });
}

async function accentPixels(page: Page, clip: Box): Promise<AccentPixels> {
  const shot = await page.screenshot({ clip });
  const [host = 0, app = 0] = await page.evaluate(
    async ({ data, targets, tolerance }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${data}`)).blob(),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D context to read the screenshot');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      return targets.map((target) => {
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const near = target.every(
            (channel, offset) => Math.abs((pixels[index + offset] ?? 0) - channel) <= tolerance,
          );
          if (near) count += 1;
        }
        return count;
      });
    },
    {
      data: shot.toString('base64'),
      targets: [HOST_ACCENT, APP_ACCENT],
      tolerance: ACCENT_TOLERANCE,
    },
  );
  return { host, app };
}

test('the handshake is ready, init, layout-changed, resize, and each burst of edits posts one summary that the host shows', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  await expect
    .poll(async () =>
      (await logEntries(page)).slice(0, 4).map((entry) => `${entry.direction} ${entry.type}`),
    )
    .toEqual(['received ready', 'sent init', 'received layout-changed', 'received resize']);
  await expect(page.locator('#bom-items')).toHaveText('12');
  await expect(page.locator('#bom-issues')).toHaveText('1');
  await expect(page.locator('#bom-total')).toHaveText('$89,000.00');
  await expect(hostBom(page).getByRole('row')).toHaveCount(5);

  const list = editor.getByRole('listbox', { name: 'Placed items' });
  await list.getByRole('option', { name: /^CAB-01 / }).click();
  const summariesBefore = (await received(page, 'layout-changed')).length;
  await editor.getByRole('group', { name: '3D layout view' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(editor.getByRole('textbox', { name: 'X' })).toHaveValue('1.50');
  await expect
    .poll(async () => (await received(page, 'layout-changed')).length)
    .toBe(summariesBefore + 1);
  await page.waitForTimeout(700);
  expect(
    (await received(page, 'layout-changed')).length,
    'three quick moves are one burst, so the host gets one summary',
  ).toBe(summariesBefore + 1);

  await list.getByRole('option', { name: /^UPS-01 / }).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#bom-items')).toHaveText('11');
  await expect(page.locator('#bom-issues')).toHaveText('0');
  await expect(page.locator('#bom-total')).toHaveText('$79,100.00');
});

test('Send BOM to quote posts navigate with the host project, and the host opens its quote notice', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  await editor.getByRole('button', { name: 'Send BOM to quote' }).click();
  await expect(
    editor.getByText('Bill of materials sent to the host application for a quote.'),
  ).toBeVisible();
  await expect.poll(async () => (await received(page, 'navigate')).length).toBe(1);
  const [navigate] = await received(page, 'navigate');
  expect(navigate?.detail).toBe('{"to":"quote","projectId":"nw-prj-2041"}');
  await expect(page.locator('#toasts')).toContainText(
    'Opening the quote for Harbor plant · Electrical room B: 12 items, $89,000.00.',
  );
});

test('the host theme switch applies and removes the Northwind accent, font and radius in the editor', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  const root = editor.locator('html');
  const themed = () =>
    root.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue('--color-accent').trim(),
        radius: style.getPropertyValue('--radius-md').trim(),
        font: style.getPropertyValue('--font-sans').trim(),
      };
    });
  await expect.poll(themed).toMatchObject({ accent: '#0b6aa2', radius: '2px' });
  expect((await themed()).font).toMatch(/^system-ui/);

  await page.getByRole('switch', { name: 'Match the Northwind theme' }).uncheck();
  await expect.poll(async () => (await themed()).accent).not.toBe('#0b6aa2');
  const defaults = await themed();
  expect(defaults.radius).not.toBe('2px');
  expect(defaults.font).toMatch(/IBM Plex Sans/);

  await page.getByRole('switch', { name: 'Match the Northwind theme' }).check();
  await expect.poll(themed).toMatchObject({ accent: '#0b6aa2', radius: '2px' });
});

test('in the host page the 3D selection takes the host accent, like the tag and the legend, and follows the theme switch', async ({
  page,
}) => {
  const editor = await openHost(page);
  const canvas = await waitForView(editor);
  await editor.getByRole('option', { name: /^CAB-01 / }).click();
  await page.mouse.move(5, 5);

  const tag = await boxOf(editor.locator('[class*="tagAnchor"]'));
  const view = await boxOf(canvas);
  const left = Math.max(view.x, tag.x + tag.width / 2 - 140);
  const below: Box = { x: left, y: tag.y + tag.height, width: 280, height: 220 };

  await expect
    .poll(
      async () => {
        const { host, app } = await accentPixels(page, below);
        return { hostAccentDrawn: host > ACCENT_DRAWN, appAccentPixels: app };
      },
      { message: 'outline and halo in the host accent' },
    )
    .toEqual({ hostAccentDrawn: true, appAccentPixels: 0 });

  await page.locator('#theme-switch').click();
  await expect
    .poll(
      async () => {
        const { host, app } = await accentPixels(page, below);
        return { appAccentDrawn: app > ACCENT_DRAWN, hostAccentPixels: host };
      },
      { message: 'outline and halo back in the app accent' },
    )
    .toEqual({ appAccentDrawn: true, hostAccentPixels: 0 });
});

test('resizing the host window reaches the host as a resize message with the editor document height', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  const reportedHeights = async () =>
    (await received(page, 'resize')).map((entry) => {
      const match = /"height":(\d+)/.exec(entry.detail);
      return match ? Number(match[1]) : Number.NaN;
    });
  await expect.poll(async () => (await reportedHeights()).length).toBe(1);
  await page.setViewportSize({ width: 1600, height: 820 });
  await expect.poll(async () => (await reportedHeights()).length).toBe(2);
  const height = await editor
    .locator('html')
    .evaluate((element) => Math.ceil(element.scrollHeight));
  expect((await reportedHeights()).at(-1)).toBe(height);
  await expect(page.locator('#frame-height')).toHaveText(`${height.toLocaleString('en-US')} px`);
});

test('the token is renewed a minute before it expires, and when the host stops renewing the editor pauses and reports token-expired', async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  const editor = await openConnectedEditor(page);
  const badge = editor.getByRole('region', { name: 'Host connection' });
  await expect(badge).toContainText('Token valid for 2:00');
  await page.clock.resume();

  await page.clock.fastForward('00:57');
  expect(await received(page, 'token-request')).toEqual([]);
  await page.clock.fastForward('00:04');
  await expect
    .poll(async () => (await received(page, 'token-request')).map((entry) => entry.detail))
    .toEqual(['{"reason":"expiring"}']);
  await expect
    .poll(async () => (await logEntries(page)).at(-1))
    .toMatchObject({ direction: 'sent', type: 'token' });
  await expect(badge).toBeVisible();

  await page.getByRole('checkbox', { name: 'Renew tokens automatically' }).uncheck();
  await page.clock.fastForward('02:01');
  await expect(editor.getByRole('alert')).toContainText('Access expired.');
  await expect(badge).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Send BOM to quote' })).toHaveCount(0);
  await expect
    .poll(async () => (await received(page, 'token-request')).map((entry) => entry.detail))
    .toEqual(['{"reason":"expiring"}', '{"reason":"expiring"}', '{"reason":"expired"}']);
  await expect
    .poll(async () => (await received(page, 'error')).map((entry) => entry.detail))
    .toEqual([
      '{"code":"token-expired","message":"The access token expired before a new one arrived."}',
    ]);
  await expect(page.locator('#connection-text')).toHaveText('Token expired');
  await expect(page.locator('#toasts .toast').last()).toHaveCSS('opacity', '1');
  expect(await seriousAxeViolations(page), 'the expired state passes axe WCAG 2.2 AA').toEqual([]);

  await page.getByRole('checkbox', { name: 'Renew tokens automatically' }).check();
  await expect(badge).toBeVisible();
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
});

test('an init forged by another window on an allowed origin, or by the editor itself, is ignored', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  const forgedInit = {
    protocol: 'cwx.layout-editor',
    version: 1,
    type: 'init',
    payload: {
      user: { id: 'mallory', name: 'Mallory Forged' },
      project: { id: 'forged-project', name: 'Forged project' },
      locale: 'vi',
      token: 'forged-token',
      tokenExpiresAt: Date.now() + 600_000,
    },
  };
  await page.route(`${HOST_ORIGIN}/__qa/sibling.html`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sibling</title></head><body><script>window.parent.frames[0].postMessage(${JSON.stringify(forgedInit)}, '*');</script></body></html>`,
    }),
  );
  const summariesBefore = (await received(page, 'layout-changed')).length;
  await page.evaluate((hostOrigin) => {
    const sibling = document.createElement('iframe');
    sibling.title = 'Sibling frame';
    sibling.src = `${hostOrigin}/__qa/sibling.html`;
    document.body.append(sibling);
  }, HOST_ORIGIN);
  await expect(page.frameLocator('iframe[title="Sibling frame"]').locator('body')).toBeAttached();
  await editor.locator('body').evaluate((_body, message) => {
    window.postMessage(message, '*');
  }, forgedInit);
  await page.waitForTimeout(1000);

  await expect(editor.getByText('Harbor plant · Electrical room B', { exact: true })).toBeVisible();
  await expect(editor.getByText('Forged project')).toHaveCount(0);
  await expect(editor.locator('html')).toHaveAttribute('lang', 'en');
  expect((await received(page, 'layout-changed')).length).toBe(summariesBefore);
  expect(await received(page, 'error')).toEqual([]);

  await page.evaluate(
    ({ message, editorOrigin }) => {
      const frame = document.querySelector('iframe');
      frame?.contentWindow?.postMessage(message, editorOrigin);
    },
    { message: forgedInit, editorOrigin: EDITOR_ORIGIN },
  );
  await expect(
    editor.getByText('Forged project', { exact: true }),
    'control: the same message from the real parent is accepted, so the checks above were not vacuous',
  ).toBeVisible();
});

test('the embedded editor saves its draft under the host project and restores it after the host reloads', async ({
  page,
}) => {
  const editor = await openConnectedEditor(page);
  const list = editor.getByRole('listbox', { name: 'Placed items' });
  await list.getByRole('option', { name: /^UPS-02 / }).click();
  await page.keyboard.press('Delete');
  await expect(editor.getByRole('contentinfo', { name: 'Status' })).toContainText('Saved');
  await expect(page.locator('#bom-items')).toHaveText('11');

  const reloaded = await openConnectedEditor(page);
  await expect(reloaded.getByText('Restored your last draft.')).toBeVisible();
  await expect(
    reloaded.getByRole('listbox', { name: 'Placed items' }).getByRole('option'),
  ).toHaveCount(11);
  await expect(page.locator('#bom-items')).toHaveText('11');
});

test('in the stacked layout the resize message keeps up with the editor’s content height, not only with window resizes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  const editor = await openConnectedEditor(page);
  const root = editor.locator('html');
  await waitForView(editor);
  const documentHeight = () => root.evaluate((element) => Math.ceil(element.scrollHeight));
  const lastReportedHeight = async () => {
    const match = /"height":(\d+)/.exec((await received(page, 'resize')).at(-1)?.detail ?? '');
    return match ? Number(match[1]) : Number.NaN;
  };
  await page.waitForTimeout(1000);
  const settled = await documentHeight();
  test.info().annotations.push({
    type: 'heights after load',
    description: `editor page ${String(settled)} px; host told ${String(await lastReportedHeight())} px in ${String((await received(page, 'resize')).length)} resize message(s)`,
  });
  await expect
    .poll(lastReportedHeight, {
      message: `the editor page is ${String(settled)} px tall after loading`,
    })
    .toBe(settled);

  await editor.getByRole('button', { name: 'Show or hide the table' }).click();
  await expect
    .poll(documentHeight, 'collapsing the BOM shortens the editor page')
    .not.toBe(settled);
  await expect.poll(lastReportedHeight).toBe(await documentHeight());
});

test('with 200 items in the stacked layout, a host that sizes the frame to the editor settles, and both lists still scroll', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [DRAFT_KEY, GRID_DRAFT] as const,
  );
  await page.setViewportSize({ width: STACKED_WIDTH, height: FIRST_FRAME_HEIGHT });
  await openEditor(page);

  const reported: number[] = [];
  let frameHeight = FIRST_FRAME_HEIGHT;
  for (let round = 0; round < HOST_ROUNDS; round += 1) {
    await page.setViewportSize({ width: STACKED_WIDTH, height: frameHeight });
    frameHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    reported.push(frameHeight);
  }
  expect(reported.at(-1), `heights the host was told: ${reported.join(', ')}`).toBe(
    reported.at(-2),
  );

  const ruleList = page.getByRole('list', { name: 'Clearance issues' }).locator('..');
  for (const list of [itemList(page), ruleList]) {
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
  }
});

test('in a 1366 × 768 host window the connection badge and the token-expired alert are in view without scrolling the sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.clock.install();
  const editor = await openConnectedEditor(page);
  const hiddenBy = (element: Element) => {
    const box = element.getBoundingClientRect();
    const clip = element.closest('aside')?.getBoundingClientRect();
    const bottom = Math.min(clip?.bottom ?? window.innerHeight, window.innerHeight);
    return Math.max(0, Math.round(box.bottom - bottom));
  };
  const badge = editor.getByRole('region', { name: 'Host connection' });
  expect
    .soft(
      await badge.evaluate(hiddenBy),
      'pixels of the connection badge below the visible sidebar',
    )
    .toBe(0);

  await page.getByRole('checkbox', { name: 'Renew tokens automatically' }).uncheck();
  await page.clock.fastForward('02:01');
  const expired = editor.getByRole('alert').filter({ hasText: 'Access expired.' });
  await expect(expired).toBeAttached();
  await expect(page.locator('#connection-text')).toHaveText('Token expired');
  expect(
    await expired.evaluate(hiddenBy),
    'pixels of the token-expired alert below the visible sidebar',
  ).toBe(0);
});

test('the embedded editor keeps three placed items in view on a 1366 × 768 screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const editor = await openConnectedEditor(page);

  const visibleRows = await editor
    .getByRole('listbox', { name: /Placed items/ })
    .evaluate((list) => {
      const sidebar = list.closest('aside');
      if (!sidebar) return 0;
      const top = Math.max(list.getBoundingClientRect().top, sidebar.getBoundingClientRect().top);
      const bottom = Math.min(
        list.getBoundingClientRect().bottom,
        sidebar.getBoundingClientRect().bottom,
      );
      return [...list.querySelectorAll('[role="option"]')].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= top && box.bottom <= bottom;
      }).length;
    });
  expect(visibleRows).toBeGreaterThanOrEqual(3);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
]) {
  test(`in a ${String(viewport.width)} × ${String(viewport.height)} host window the editor gets the full width in its desktop layout, with a 3D view of at least 500 × 300 px in view`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const editor = await openHost(page);
    const view = await waitForView(editor);
    expect(
      (await boxOf(page.locator('#editor-frame'))).width,
      'iframe width',
    ).toBeGreaterThanOrEqual(1200);
    const heights = await editor.locator('html').evaluate((root) => ({
      document: root.scrollHeight,
      frame: window.innerHeight,
    }));
    expect(heights.document, 'editor document height against the frame').toBeLessThanOrEqual(
      heights.frame,
    );
    const box = await boxOf(view);
    expect(box.width, '3D view width').toBeGreaterThanOrEqual(500);
    expect(box.height, '3D view height').toBeGreaterThanOrEqual(300);
    expect(box.y, '3D view top in the window').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, '3D view bottom in the window').toBeLessThanOrEqual(viewport.height);
  });
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1280, height: 1024 },
]) {
  test(`in a ${String(viewport.width)} × ${String(viewport.height)} host window the badge, Send BOM to quote, the status bar and the token-expired alert are in view without scrolling the host page`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    const editor = await openHost(page);
    await waitForView(editor);
    const pixelsOutsideWindow = async (locator: Locator) => {
      const box = await boxOf(locator);
      return Math.round(Math.max(0, -box.y) + Math.max(0, box.y + box.height - viewport.height));
    };
    expect
      .soft(
        await pixelsOutsideWindow(editor.getByRole('region', { name: 'Host connection' })),
        'pixels of the connection badge outside the window',
      )
      .toBe(0);
    expect
      .soft(
        await pixelsOutsideWindow(editor.getByRole('button', { name: 'Send BOM to quote' })),
        'pixels of Send BOM to quote outside the window',
      )
      .toBe(0);
    expect
      .soft(
        await pixelsOutsideWindow(editor.getByRole('contentinfo', { name: 'Status' })),
        'pixels of the status bar outside the window',
      )
      .toBe(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Harbor plant · Electrical room B' }),
      'the project title stays the page heading for screen readers',
    ).toBeAttached();

    await page.locator('#auto-renew').dispatchEvent('click');
    await expect(page.locator('#auto-renew')).not.toBeChecked();
    await page.clock.fastForward('02:01');
    const expired = editor.getByRole('alert').filter({ hasText: 'Access expired.' });
    await expect(expired).toBeVisible();
    await expect(page.locator('#connection-text')).toHaveText('Token expired');
    expect(
      await pixelsOutsideWindow(expired),
      'pixels of the token-expired alert outside the window',
    ).toBe(0);
    expect(await page.evaluate(() => window.scrollY), 'host page scroll position').toBe(0);
  });
}

test('new log messages scroll inside the log, so the host page never grows taller than the window', async ({
  page,
}) => {
  await waitForView(await openHost(page));
  const rotate = page.getByRole('button', { name: 'Rotate token now' });
  for (let round = 0; round < 20; round += 1) await rotate.click();
  await expect(page.locator('#message-log > li')).toHaveCount(24);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(overflow, 'pixels the host page scrolls below the window').toBe(0);
});
