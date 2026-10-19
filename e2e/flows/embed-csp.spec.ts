import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { EDITOR_ORIGIN, HOST_ORIGIN } from '../support.ts';

const EDITOR_URL = `${EDITOR_ORIGIN}/?embed=1`;
const FRAME_ANCESTORS = "frame-ancestors 'self' http://127.0.0.1:5173 http://127.0.0.1:4173";
const DEV_SERVER_NOISE =
  /^(WebSocket connection to 'ws:|\[vite\]|Failed to send error to Vite server)/;

const OUTSIDER_PAGE = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Outsider</title></head><body>',
  `<iframe id="editor" title="Layout editor" src="${EDITOR_URL}" style="width:1280px;height:860px;border:0"></iframe>`,
  '<script>',
  'window.qaMessages = [];',
  "window.addEventListener('message', (event) => { window.qaMessages.push(String(event.data && event.data.type)); });",
  '</script></body></html>',
].join('\n');

let server: Server | null = null;
let outsiderUrl = '';

test.beforeAll(async () => {
  const outsider = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(OUTSIDER_PAGE);
  });
  await new Promise<void>((resolve) => {
    outsider.listen(0, '127.0.0.1', resolve);
  });
  const address = outsider.address();
  if (address === null || typeof address === 'string') throw new Error('No port for the outsider');
  server = outsider;
  outsiderUrl = `http://127.0.0.1:${String(address.port)}/frame.html`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => {
        resolve();
      });
    } else {
      resolve();
    }
  });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function messagesSeenByOutsider(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen: unknown = Reflect.get(window, 'qaMessages');
    return Array.isArray(seen) ? seen.map(String) : [];
  });
}

test('the dev server sends frame-ancestors with the allowed hosts on every editor response', async ({
  request,
}) => {
  for (const url of [EDITOR_URL, `${HOST_ORIGIN}/?embed=1`, `${EDITOR_ORIGIN}/`]) {
    const response = await request.get(url);
    expect(response.headers()['content-security-policy'], url).toBe(FRAME_ANCESTORS);
  }
});

test('a page on an origin outside the allow-list cannot frame the editor: the browser blocks it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(outsiderUrl);
  await expect
    .poll(() => errors.join('\n'))
    .toContain(
      `Framing '${EDITOR_ORIGIN}/' violates the following Content Security Policy directive: "${FRAME_ANCESTORS}". The request has been blocked.`,
    );
  expect(
    page.frames().some((frame) => frame !== page.mainFrame() && frame.url().startsWith('http')),
    'no frame holds the editor',
  ).toBe(false);
  await page.waitForTimeout(1000);
  expect(await messagesSeenByOutsider(page)).toEqual([]);
});

test('even with the CSP header removed, the bridge refuses a parent outside the allow-list: no ready, and its init is ignored', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.route(
    (url) => url.href === EDITOR_URL,
    async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['content-security-policy'];
      await route.fulfill({ response, headers });
    },
  );
  await page.goto(outsiderUrl);
  const editor = page.frameLocator('#editor');
  const dialog = editor.getByRole('alertdialog', { name: 'Can’t connect to the host application' });
  await expect(dialog).toContainText('Error code: no-host');
  await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    frame?.contentWindow?.postMessage(
      {
        protocol: 'cwx.layout-editor',
        version: 1,
        type: 'init',
        payload: {
          user: { id: 'outsider', name: 'Outsider User' },
          project: { id: 'outsider-project', name: 'Outsider project' },
          locale: 'en',
          token: 'outsider-token',
          tokenExpiresAt: Date.now() + 600_000,
        },
      },
      '*',
    );
  });
  await page.waitForTimeout(1500);
  expect(await messagesSeenByOutsider(page), 'the bridge posted nothing to this parent').toEqual(
    [],
  );
  await expect(dialog).toBeVisible();
  await expect(editor.getByText('Outsider project')).toHaveCount(0);
  expect(
    errors.filter((text) => !DEV_SERVER_NOISE.test(text)),
    'no errors apart from the dev server’s live-reload socket, which this test’s interception cuts off',
  ).toEqual([]);
});
