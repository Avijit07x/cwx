import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import hostPage from '../../host.html?raw';
import {
  envelope,
  parseHostMessage,
  PROTOCOL,
  type EditorMessage,
  type HostMessage,
} from '../embed/protocol';
import {
  createMockToken,
  HOST_PROJECT,
  HOST_USER,
  NORTHWIND_THEME,
  redactTokens,
  startHost,
  TOKEN_LIFETIME_MS,
} from './host';
import { hostMessages, type HostMessageKey } from './strings';

const EDITOR_ORIGIN = 'http://localhost:5173';
const BASE64URL_TOKEN = /^[\w-]{43}$/;

let stop: () => void = () => undefined;

interface Harness {
  readonly frame: HTMLIFrameElement;
  readonly editor: Window;
  readonly sent: () => readonly {
    readonly message: HostMessage | null;
    readonly targetOrigin: unknown;
  }[];
  readonly clear: () => void;
  readonly receive: (
    data: unknown,
    from?: { readonly origin?: string; readonly source?: Window | null },
  ) => void;
  readonly emit: (message: EditorMessage) => void;
  readonly logText: () => string;
}

function mountHostPage(editorOrigin = EDITOR_ORIGIN): Harness {
  const page = new DOMParser().parseFromString(hostPage, 'text/html');
  for (const script of page.querySelectorAll('script')) script.remove();
  document.body.replaceChildren(...page.body.childNodes);
  const frame = document.getElementById('editor-frame');
  if (!(frame instanceof HTMLIFrameElement)) throw new Error('host.html has no editor iframe');
  stop = startHost(editorOrigin);
  const editor = frame.contentWindow;
  if (!editor) throw new Error('The editor iframe has no window');
  const posts: { readonly data: unknown; readonly targetOrigin: unknown }[] = [];
  vi.spyOn(editor, 'postMessage').mockImplementation((data: unknown, targetOrigin: unknown) => {
    posts.push({ data, targetOrigin });
  });
  const receive: Harness['receive'] = (data, { origin = EDITOR_ORIGIN, source = editor } = {}) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  };
  return {
    frame,
    editor,
    sent: () =>
      posts.map((post) => ({
        message: parseHostMessage(post.data),
        targetOrigin: post.targetOrigin,
      })),
    clear: () => {
      posts.length = 0;
    },
    receive,
    emit: (message) => {
      receive(envelope(message));
    },
    logText: () => document.getElementById('message-log')?.textContent ?? '',
  };
}

function sentTypes(harness: Harness): readonly (string | undefined)[] {
  return harness.sent().map(({ message }) => message?.type);
}

function lastToken(harness: Harness): string {
  const message = harness.sent().at(-1)?.message;
  if (message?.type !== 'token' && message?.type !== 'init') throw new Error('No token was sent');
  return message.payload.token;
}

function connect(harness: Harness): void {
  harness.emit({ type: 'ready', payload: { version: 1 } });
}

const SUMMARY: EditorMessage = {
  type: 'layout-changed',
  payload: {
    itemCount: 12,
    violationCount: 1,
    bom: {
      lines: [
        { partNumber: 'LE-SWG-1005', quantity: 4 },
        { partNumber: 'LE-VFD-0505', quantity: 4 },
        { partNumber: 'LE-TRF-1510', quantity: 2 },
        { partNumber: 'LE-UPS-1010', quantity: 2 },
      ],
      totalUsd: 89_000,
    },
  },
};

beforeEach(() => {
  document.documentElement.lang = 'en';
});

afterEach(() => {
  stop();
  stop = () => undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('host page', () => {
  it('sandboxes the frame only together with the cross-origin address, never the blank placeholder', () => {
    const markup = new DOMParser().parseFromString(hostPage, 'text/html');
    expect(markup.getElementById('editor-frame')?.hasAttribute('sandbox')).toBe(false);
  });

  it('frames the editor cross-origin in a sandboxed iframe', () => {
    const { frame } = mountHostPage();

    expect(frame.getAttribute('src')).toBe('http://localhost:5173/?embed=1');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(frame).toHaveAttribute('title', 'Layout editor');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HOST_PROJECT.name);
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
  });

  it('answers ready with init for the signed-in user, posted only to the editor origin', () => {
    const harness = mountHostPage();
    connect(harness);

    const [init] = harness.sent();
    expect(harness.sent()).toHaveLength(1);
    expect(init?.targetOrigin).toBe(EDITOR_ORIGIN);
    if (init?.message?.type !== 'init') throw new Error('Expected init');
    const { payload } = init.message;
    expect(payload.user).toEqual(HOST_USER);
    expect(payload.project).toEqual(HOST_PROJECT);
    expect(payload.locale).toBe('en');
    expect(payload.theme).toEqual(NORTHWIND_THEME);
    expect(payload.token).toMatch(BASE64URL_TOKEN);
    expect(payload.tokenExpiresAt - Date.now()).toBeGreaterThan(TOKEN_LIFETIME_MS - 1000);
    expect(payload.tokenExpiresAt - Date.now()).toBeLessThanOrEqual(TOKEN_LIFETIME_MS);
    expect(document.getElementById('connection-text')).toHaveTextContent('Connected');
    expect(harness.logText()).toContain('ready');
    expect(harness.logText()).toContain('init');
    expect(harness.logText()).toContain('[redacted]');
    expect(harness.logText()).not.toContain(payload.token);
  });

  it('ignores messages from other origins or windows', () => {
    const harness = mountHostPage();
    const ready = envelope({ type: 'ready', payload: { version: 1 } });

    harness.receive(ready, { origin: 'http://127.0.0.1:5173' });
    harness.receive(ready, { origin: 'https://attacker.example' });
    harness.receive(ready, { source: window });
    harness.receive(ready, { source: null });

    expect(harness.sent()).toEqual([]);
    expect(harness.logText()).toBe('');
    expect(document.getElementById('connection-text')).toHaveTextContent('Waiting for the editor…');
  });

  it('logs editor messages that fail validation as rejected and does not act on them', () => {
    const harness = mountHostPage();

    harness.receive({ protocol: PROTOCOL, version: 1, type: 'resize', payload: { height: -5 } });
    harness.receive({ protocol: PROTOCOL, version: 9, type: 'ready', payload: { version: 9 } });
    harness.receive('ready');
    harness.receive({ type: 7 });

    expect(harness.sent()).toEqual([]);
    const entries = document.querySelectorAll<HTMLElement>(
      '#message-log [data-direction="rejected"]',
    );
    expect([...entries].map((entry) => entry.dataset.type)).toEqual([
      'object',
      'string',
      'ready',
      'resize',
    ]);
    expect(harness.logText()).toContain('Rejected: failed validation');
    expect(document.getElementById('frame-height')).toHaveTextContent('—');
  });

  it('renews the token when the editor asks, unless automatic renewal is off', async () => {
    const user = userEvent.setup();
    const harness = mountHostPage();
    connect(harness);
    const initialToken = lastToken(harness);
    harness.clear();

    harness.emit({ type: 'token-request', payload: { reason: 'expiring' } });
    expect(sentTypes(harness)).toEqual(['token']);
    const renewed = lastToken(harness);
    expect(renewed).toMatch(BASE64URL_TOKEN);
    expect(renewed).not.toBe(initialToken);

    await user.click(screen.getByRole('checkbox', { name: 'Renew tokens automatically' }));
    harness.clear();
    harness.emit({ type: 'token-request', payload: { reason: 'expired' } });
    expect(harness.sent()).toEqual([]);
    expect(harness.logText()).toContain('Not answered: automatic renewal is off.');

    await user.click(screen.getByRole('checkbox', { name: 'Renew tokens automatically' }));
    expect(sentTypes(harness)).toEqual(['token']);
    expect(harness.logText()).not.toContain(lastToken(harness));
  });

  it('rotates the token on demand once the editor is connected', async () => {
    const user = userEvent.setup();
    const harness = mountHostPage();
    const rotate = screen.getByRole('button', { name: 'Rotate token now' });
    expect(rotate).toBeDisabled();

    connect(harness);
    harness.clear();
    await user.click(rotate);

    expect(sentTypes(harness)).toEqual(['token']);
    expect(harness.sent()[0]?.targetOrigin).toBe(EDITOR_ORIGIN);
  });

  it('switches its own language and the editor’s from the language select', async () => {
    const user = userEvent.setup();
    const harness = mountHostPage();
    connect(harness);
    harness.clear();
    expect(document.title).toBe('Northwind Product Selector');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'vi');

    expect(harness.sent().map(({ message }) => message)).toEqual([
      { type: 'locale', payload: { locale: 'vi' } },
    ]);
    expect(document.documentElement.lang).toBe('vi');
    expect(document.title).toBe('Bộ chọn sản phẩm Northwind');
    expect(screen.getByRole('heading', { name: 'Bảng điều khiển tích hợp' })).toBeInTheDocument();
    expect(harness.frame).toHaveAttribute('title', 'Trình bố trí thiết bị');
    expect(document.getElementById('connection-text')).toHaveTextContent('Đã kết nối');
    expect(screen.getByRole('navigation', { name: 'Đường dẫn' })).toBeInTheDocument();
  });

  it('sends editor defaults or the Northwind theme from the theme switch', async () => {
    const user = userEvent.setup();
    const harness = mountHostPage();
    connect(harness);
    harness.clear();
    const themeSwitch = screen.getByRole('switch', { name: 'Match the Northwind theme' });

    await user.click(themeSwitch);
    await user.click(themeSwitch);

    expect(harness.sent().map(({ message }) => message)).toEqual([
      { type: 'theme', payload: {} },
      { type: 'theme', payload: NORTHWIND_THEME },
    ]);
  });

  it('shows the bill of materials and editor height reported by the editor', () => {
    const harness = mountHostPage();
    connect(harness);

    harness.emit(SUMMARY);
    harness.emit({ type: 'resize', payload: { height: 1812 } });

    expect(document.getElementById('bom-items')).toHaveTextContent('12');
    expect(document.getElementById('bom-issues')).toHaveTextContent('1');
    expect(document.getElementById('bom-total')).toHaveTextContent('$89,000.00');
    const table = screen.getByRole('table', { name: 'Parts reported by the editor' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(within(table).getByText('LE-TRF-1510')).toBeInTheDocument();
    expect(document.getElementById('frame-height')).toHaveTextContent('1,812 px');
  });

  it('shows a host notice when the editor asks to open the quote', () => {
    const harness = mountHostPage();
    connect(harness);
    harness.emit(SUMMARY);

    harness.emit({ type: 'navigate', payload: { to: 'quote', projectId: HOST_PROJECT.id } });

    expect(screen.getByRole('status')).toHaveTextContent(
      `Opening the quote for ${HOST_PROJECT.name}: 12 items, $89,000.00.`,
    );
  });

  it('counts down the token lifetime', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 18, 9, 0, 0) });
    const harness = mountHostPage();
    connect(harness);
    const tokenText = document.getElementById('token-text');

    expect(tokenText).toHaveTextContent('Expires in 2:00');
    vi.advanceTimersByTime(30_000);
    expect(tokenText).toHaveTextContent('Expires in 1:30');
    vi.advanceTimersByTime(TOKEN_LIFETIME_MS);
    expect(tokenText).toHaveTextContent('Expired');
    expect(document.getElementById('connection-text')).toHaveTextContent('Token expired');
  });

  it('refuses to frame the editor from the editor’s own origin', () => {
    const { frame } = mountHostPage(window.location.origin);

    expect(screen.getByRole('alert')).toHaveTextContent('would not be cross-origin');
    expect(frame).not.toHaveAttribute('src');
    expect(frame).not.toBeVisible();
  });
});

describe('createMockToken', () => {
  it('issues random base64url tokens that live for two minutes', () => {
    const first = createMockToken(1_000);
    const second = createMockToken(1_000);

    expect(first.token).toMatch(BASE64URL_TOKEN);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenExpiresAt).toBe(1_000 + TOKEN_LIFETIME_MS);
    expect(parseHostMessage(envelope({ type: 'token', payload: first }))).toEqual({
      type: 'token',
      payload: first,
    });
  });
});

describe('redactTokens', () => {
  it('hides token values at any depth', () => {
    const text = redactTokens({ token: 'abc', nested: { token: 'def', tokenExpiresAt: 5 } });

    expect(text).toBe('{"token":"[redacted]","nested":{"token":"[redacted]","tokenExpiresAt":5}}');
  });
});

describe('host strings', () => {
  it('translate every key into Vietnamese with the same placeholders', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const keys = Object.keys(hostMessages.en).filter(
      (key): key is HostMessageKey => key in hostMessages.vi,
    );

    expect(keys).toHaveLength(Object.keys(hostMessages.en).length);
    for (const key of keys) {
      expect(hostMessages.vi[key].trim()).not.toBe('');
      expect(placeholders(hostMessages.vi[key])).toEqual(placeholders(hostMessages.en[key]));
    }
  });
});
