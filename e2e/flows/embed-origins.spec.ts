import type { Page } from '@playwright/test';
import {
  EDITOR_ORIGIN,
  expect,
  HOST_ORIGIN,
  HOST_URL,
  seriousAxeViolations,
  test,
} from '../support.ts';

const PROTOCOL = 'cwx.layout-editor';
const TOKEN = 'qa-c-token-6f1d2c9a8b7e4d3c2b1a';
const FRAME_ID = 'qa-editor';
const MAX_SHORT_GRANTS = 25;

interface Delivered {
  readonly origin: string;
  readonly fromFrame: boolean;
  readonly type: string;
  readonly payload: unknown;
}

interface Posted {
  readonly receiver: string;
  readonly type: string;
  readonly targetOrigin: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function toDelivered(entry: unknown): Delivered | null {
  if (!isRecord(entry)) return null;
  const { origin, fromFrame, data } = entry;
  if (typeof origin !== 'string' || typeof fromFrame !== 'boolean') return null;
  const type = isRecord(data) && typeof data.type === 'string' ? data.type : typeof data;
  return { origin, fromFrame, type, payload: isRecord(data) ? data.payload : data };
}

function toPosted(entry: unknown): Posted | null {
  if (!isRecord(entry)) return null;
  const { receiver, type, targetOrigin } = entry;
  if (
    typeof receiver !== 'string' ||
    typeof type !== 'string' ||
    typeof targetOrigin !== 'string'
  ) {
    return null;
  }
  return { receiver, type, targetOrigin };
}

function swapFrameScript(frameSrc: string): string {
  return `(() => {
    document.getElementById('editor-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = '${FRAME_ID}';
    frame.title = 'Layout editor under test';
    frame.style.cssText = 'width:1280px;height:860px;border:0';
    window.addEventListener('message', (event) => {
      window.qaDelivered({ origin: event.origin, fromFrame: event.source === frame.contentWindow, data: event.data });
    });
    frame.src = ${JSON.stringify(frameSrc)};
    document.body.prepend(frame);
  })()`;
}

async function openHostWithFrame(
  page: Page,
  frameSrc = `${EDITOR_ORIGIN}/?embed=1`,
): Promise<Delivered[]> {
  const delivered: Delivered[] = [];
  await page.exposeFunction('qaDelivered', (entry: unknown) => {
    const parsed = toDelivered(entry);
    if (parsed?.fromFrame) delivered.push(parsed);
  });
  await page.goto(HOST_URL);
  await page.evaluate(swapFrameScript(frameSrc));
  return delivered;
}

async function sendToEditor(
  page: Page,
  message: Readonly<Record<string, unknown>>,
  targetOrigin = EDITOR_ORIGIN,
): Promise<void> {
  await page.evaluate(
    ({ id, message, targetOrigin }) => {
      const frame = document.getElementById(id);
      if (frame instanceof HTMLIFrameElement)
        frame.contentWindow?.postMessage(message, targetOrigin);
    },
    { id: FRAME_ID, message, targetOrigin },
  );
}

function initMessage(changes: Readonly<Record<string, unknown>> = {}) {
  return {
    protocol: PROTOCOL,
    version: 1,
    type: 'init',
    payload: {
      user: { id: 'qa-user', name: 'Quinn Tester' },
      project: { id: 'qa-project-7', name: 'QA electrical room' },
      locale: 'en',
      token: TOKEN,
      tokenExpiresAt: Date.now() + 10 * 60_000,
      ...changes,
    },
  };
}

function typesOf(delivered: readonly Delivered[]): string[] {
  return delivered.map((entry) => entry.type);
}

const RECORD_POSTS = `(() => {
  if (location.pathname !== '/host.html') return;
  const original = window.postMessage;
  window.postMessage = function (message, targetOrigin, transfer) {
    const type = message && typeof message === 'object' ? String(message.type) : typeof message;
    const target = typeof targetOrigin === 'string' ? targetOrigin : JSON.stringify(targetOrigin);
    if (typeof window.qaPosted === 'function') {
      window.qaPosted({ receiver: location.href, type, targetOrigin: target });
    }
    return original.apply(window, arguments);
  };
})();`;

async function recordPostsToHost(page: Page): Promise<Posted[]> {
  const posted: Posted[] = [];
  await page.exposeFunction('qaPosted', (entry: unknown) => {
    const parsed = toPosted(entry);
    if (parsed?.receiver === HOST_URL) posted.push(parsed);
  });
  await page.addInitScript({ content: RECORD_POSTS });
  return posted;
}

function editorFrame(page: Page) {
  return page.frameLocator(`#${FRAME_ID}`);
}

test('the editor posts ready, and after init every summary and size, only to the allowed parent origin, never to "*"', async ({
  page,
}) => {
  const posted = await recordPostsToHost(page);
  await openHostWithFrame(page, `${HOST_ORIGIN}/?embed=1`);
  await expect
    .poll(() => posted.map((entry) => `${entry.type} → ${entry.targetOrigin}`))
    .toEqual([`ready → ${HOST_ORIGIN}`]);
  await page.waitForTimeout(1000);
  expect(posted, 'nothing else is posted before init').toHaveLength(1);

  await sendToEditor(page, initMessage(), HOST_ORIGIN);
  await expect(editorFrame(page).getByRole('region', { name: 'Host connection' })).toBeVisible();
  await editorFrame(page).getByRole('button', { name: 'Send BOM to quote' }).click();
  await expect.poll(() => posted.map((entry) => entry.type)).toContain('navigate');
  expect(new Set(posted.map((entry) => entry.type))).toEqual(
    new Set(['ready', 'layout-changed', 'resize', 'navigate']),
  );
  expect(new Set(posted.map((entry) => entry.targetOrigin))).toEqual(new Set([HOST_ORIGIN]));
});

test('a page on the editor’s own origin may frame it, but the bridge refuses it: no-host error, nothing posted, its init ignored', async ({
  page,
}) => {
  const delivered: Delivered[] = [];
  await page.exposeFunction('qaDelivered', (entry: unknown) => {
    const parsed = toDelivered(entry);
    if (parsed) delivered.push(parsed);
  });
  await page.route(`${EDITOR_ORIGIN}/__qa/self-host.html`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Same origin</title></head><body></body></html>',
    }),
  );
  await page.goto(`${EDITOR_ORIGIN}/__qa/self-host.html`);
  await page.evaluate(swapFrameScript(`${EDITOR_ORIGIN}/?embed=1`));
  const editor = editorFrame(page);
  const dialog = editor.getByRole('alertdialog', { name: 'Can’t connect to the host application' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Error code: no-host');
  await sendToEditor(page, initMessage(), EDITOR_ORIGIN);
  await page.waitForTimeout(1500);
  expect(delivered, 'the bridge posts nothing to a parent that is not allowed').toEqual([]);
  await expect(dialog).toBeVisible();
  await expect(editor.getByText('QA electrical room')).toHaveCount(0);
});

test('a host that never sends init gets init-timeout after 8 s and a reload offer, and a late init still connects', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  await expect(
    editor.getByRole('dialog', { name: 'Connecting to the host application…' }),
  ).toBeVisible();
  await expect.poll(() => typesOf(delivered), { timeout: 12_000 }).toEqual(['ready', 'error']);
  expect(delivered[1]?.payload).toEqual({
    code: 'init-timeout',
    message: 'No valid init message arrived within 8 s.',
  });
  const dialog = editor.getByRole('alertdialog', { name: 'Can’t connect to the host application' });
  await expect(dialog).toContainText('Error code: init-timeout');
  await expect(dialog.getByRole('button', { name: 'Reload editor' })).toBeVisible();
  expect(await seriousAxeViolations(page), 'the error dialog passes axe WCAG 2.2 AA').toEqual([]);

  await sendToEditor(page, initMessage());
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByText('QA electrical room', { exact: true })).toBeVisible();
  await expect(editor.getByText('Quinn Tester', { exact: true })).toBeVisible();
});

test('a host that starts listening after ready was posted still connects by sending init once the frame has loaded', async ({
  page,
}) => {
  await page.goto(HOST_URL);
  const lateInit = initMessage({
    user: { id: 'late-user', name: 'Lee Late' },
    project: { id: 'late-project', name: 'Late host room' },
    token: 'late-token-1',
    tokenExpiresAt: Date.now() + 600_000,
  });
  const received = await page.evaluate(
    ({ editorOrigin, message }) =>
      new Promise<readonly string[]>((resolve) => {
        document.getElementById('editor-frame')?.remove();
        const frame = document.createElement('iframe');
        frame.title = 'Late editor';
        frame.style.cssText = 'width:1280px;height:800px;border:0';
        frame.addEventListener('load', () => {
          setTimeout(() => {
            const types: string[] = [];
            window.addEventListener('message', (event: MessageEvent<unknown>) => {
              const { data } = event;
              if (event.source !== frame.contentWindow || typeof data !== 'object' || !data) return;
              types.push('type' in data ? String(data.type) : 'unknown');
              if (types.includes('layout-changed')) resolve(types);
            });
            frame.contentWindow?.postMessage(message, editorOrigin);
          }, 1000);
        });
        frame.src = `${editorOrigin}/?embed=1`;
        document.body.append(frame);
      }),
    { editorOrigin: EDITOR_ORIGIN, message: lateInit },
  );
  expect(received, 'the host missed ready and still got the first summary').toEqual([
    'layout-changed',
  ]);
  const editor = page.frameLocator('iframe[title="Late editor"]');
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
  await expect(editor.getByText('Late host room', { exact: true })).toBeVisible();
});

test('invalid protocol messages are answered with invalid-message and change nothing; foreign messages and early locale messages are ignored', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  await expect.poll(() => typesOf(delivered)).toEqual(['ready']);
  const valid = initMessage();
  await sendToEditor(page, { hello: 'world' });
  await sendToEditor(page, { ...valid, version: 2 });
  await sendToEditor(page, initMessage({ user: { id: 'qa-user', name: '   ' } }));
  await sendToEditor(page, initMessage({ token: 'not a bearer token' }));
  await sendToEditor(page, initMessage({ theme: { accent: 'red' } }));
  await expect
    .poll(() => typesOf(delivered))
    .toEqual(['ready', 'error', 'error', 'error', 'error']);
  for (const entry of delivered.slice(1)) {
    expect(entry.payload).toEqual({
      code: 'invalid-message',
      message: 'The message failed validation and was ignored.',
    });
  }
  await expect(
    editor.getByRole('dialog', { name: 'Connecting to the host application…' }),
  ).toBeVisible();

  await sendToEditor(page, {
    protocol: PROTOCOL,
    version: 1,
    type: 'locale',
    payload: { locale: 'vi' },
  });
  await page.waitForTimeout(500);
  await expect(editor.locator('html'), 'a locale message before init is ignored').toHaveAttribute(
    'lang',
    'en',
  );
  await sendToEditor(page, valid);
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
});

test('a host accent that white text cannot be read on is not applied and is reported as theme-rejected', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  await expect.poll(() => typesOf(delivered)).toEqual(['ready']);
  await sendToEditor(page, initMessage({ theme: { accent: '#ffeb3b', radius: 8 } }));
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
  await expect.poll(() => typesOf(delivered)).toContain('error');
  expect(delivered.find((entry) => entry.type === 'error')?.payload).toEqual({
    code: 'theme-rejected',
    message: 'Accent #ffeb3b is below 4.5:1 contrast with white text; the default accent is used.',
  });
  const styles = await editor.locator('html').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      accent: style.getPropertyValue('--color-accent').trim(),
      radius: style.getPropertyValue('--radius-md').trim(),
    };
  });
  expect(styles).toEqual({ accent: '#2357d9', radius: '8px' });
});

test('the token stays in memory: it reaches no storage, cookie, URL, DOM text or message back to the host', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  await expect.poll(() => typesOf(delivered)).toEqual(['ready']);
  await sendToEditor(page, initMessage());
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
  await editor.getByRole('button', { name: 'Send BOM to quote' }).click();
  await expect.poll(() => typesOf(delivered)).toContain('navigate');
  const places = await editor.locator('html').evaluate(() => {
    const stored = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }).join('\n');
    return {
      localStorage: stored(localStorage),
      sessionStorage: stored(sessionStorage),
      cookie: document.cookie,
      url: location.href,
      dom: document.documentElement.outerHTML,
      name: window.name,
    };
  });
  for (const [place, text] of Object.entries(places)) {
    expect(text.includes(TOKEN), `the token is not in ${place}`).toBe(false);
  }
  expect(JSON.stringify(delivered).includes(TOKEN), 'no message to the host carries it').toBe(
    false,
  );
});

test('a host that keeps issuing tokens that expire within a minute is not flooded with token requests', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  await expect.poll(() => typesOf(delivered)).toEqual(['ready']);
  await page.evaluate(`(() => {
    const frame = document.getElementById('${FRAME_ID}');
    let issued = 0;
    const grant = () => { issued += 1; return { token: 'short-token-' + issued, tokenExpiresAt: Date.now() + 30000 }; };
    window.addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'token-request' || issued >= ${MAX_SHORT_GRANTS}) return;
      frame.contentWindow.postMessage({ protocol: '${PROTOCOL}', version: 1, type: 'token', payload: grant() }, '${EDITOR_ORIGIN}');
    });
  })()`);
  await sendToEditor(page, initMessage({ tokenExpiresAt: Date.now() + 30_000 }));
  await expect(editor.getByRole('region', { name: 'Host connection' })).toBeVisible();
  const requests = () => delivered.filter((entry) => entry.type === 'token-request').length;
  await page.waitForTimeout(2000);
  test.info().annotations.push({
    type: 'token requests',
    description: `${String(requests())} token requests in the first two seconds; the host answered at most ${String(MAX_SHORT_GRANTS)} of them, each with a fresh 30 s token`,
  });
  expect(
    requests(),
    'a fresh 30 s token must not trigger another request at once (the host stops answering after 25)',
  ).toBeLessThanOrEqual(2);
});

test('an edit made just before the host opens another project is still saved to the first project', async ({
  page,
}) => {
  const delivered = await openHostWithFrame(page);
  const editor = editorFrame(page);
  const status = editor.getByRole('contentinfo', { name: 'Status' });
  const list = editor.getByRole('listbox', { name: 'Placed items' });
  const firstProject = initMessage();
  const secondProject = initMessage({
    project: { id: 'qa-project-8', name: 'QA switchboard room' },
  });
  const deleteFirstRow = async () => {
    await list.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete');
  };
  await expect.poll(() => typesOf(delivered)).toEqual(['ready']);
  await sendToEditor(page, firstProject);
  await expect(status).toContainText('12 items');

  await deleteFirstRow();
  await expect(status).toContainText('Saved');
  await sendToEditor(page, secondProject);
  await expect(editor.getByText('QA switchboard room', { exact: true })).toBeVisible();
  await sendToEditor(page, firstProject);
  await expect(editor.getByText('QA electrical room', { exact: true })).toBeVisible();
  await expect(status, 'control: a deletion saved before the switch is kept').toContainText(
    '11 items',
  );

  await deleteFirstRow();
  await sendToEditor(page, secondProject);
  await expect(editor.getByText('QA switchboard room', { exact: true })).toBeVisible();
  await sendToEditor(page, firstProject);
  await expect(editor.getByText('QA electrical room', { exact: true })).toBeVisible();
  await expect(
    status,
    'a deletion still waiting for autosave when the host switches projects is saved, not dropped',
  ).toContainText('10 items');
});
