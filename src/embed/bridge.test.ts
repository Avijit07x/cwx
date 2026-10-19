import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveBom } from '../domain/bom';
import { findViolations } from '../domain/rules';
import { sampleLayout } from '../domain/seed';
import { addItem, moveItem, select } from '../state/actions';
import { DEFAULT_SESSION, resetEditor, useEditor } from '../state/store';
import {
  INIT_TIMEOUT_MS,
  LAYOUT_DEBOUNCE_MS,
  readyTargets,
  reportCrash,
  requestQuote,
  RESIZE_DEBOUNCE_MS,
  startHostBridge,
  TOKEN_REFRESH_LEAD_MS,
  useEmbed,
} from './bridge';
import { envelope, PROTOCOL, type HostMessage, type InitPayload } from './protocol';
import {
  ALLOWED_ORIGINS,
  frameInFakeHost,
  HOST_ORIGIN,
  OTHER_ALLOWED_ORIGIN,
  type FakeHost,
} from '../test/fakeHost';

const NOW = Date.UTC(2026, 9, 18, 9, 0, 0);
const TOKEN = 'tok_SECRET-4f1b2c9e';
const TOKEN_LIFETIME_MS = 120_000;
const NORTHWIND_THEME = { accent: '#0b6aa2', fontFamily: 'system-ui', radius: 2 } as const;

let projectSeq = 0;
let stop: () => void = () => undefined;

function initPayload(overrides: Partial<InitPayload> = {}): InitPayload {
  projectSeq += 1;
  return {
    user: { id: 'u-1042', name: 'Alex Morgan' },
    project: { id: `prj-${projectSeq}`, name: 'Harbor plant · Electrical room B' },
    locale: 'en',
    token: TOKEN,
    tokenExpiresAt: Date.now() + TOKEN_LIFETIME_MS,
    ...overrides,
  };
}

function init(overrides: Partial<InitPayload> = {}): HostMessage {
  return { type: 'init', payload: initPayload(overrides) };
}

function connectedHost(overrides: Partial<InitPayload> = {}): FakeHost {
  const host = frameInFakeHost();
  stop = startHostBridge(ALLOWED_ORIGINS);
  host.send(init(overrides));
  return host;
}

function rootStyle(property: string): string {
  return document.documentElement.style.getPropertyValue(property);
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  resetEditor();
  useEditor.setState({ session: { ...DEFAULT_SESSION, embedded: true }, saveStatus: 'off' });
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  stop();
  stop = () => undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('handshake', () => {
  it('posts ready to each allowed origin with that origin as the target, never "*"', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);

    expect(host.sent().map(({ message, targetOrigin }) => [message, targetOrigin])).toEqual([
      [{ type: 'ready', payload: { version: 1 } }, HOST_ORIGIN],
      [{ type: 'ready', payload: { version: 1 } }, OTHER_ALLOWED_ORIGIN],
    ]);
    expect(host.sent().some(({ targetOrigin }) => targetOrigin === '*')).toBe(false);
    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
  });

  it('posts ready only to the parent origin when the browser reports it', () => {
    Object.defineProperty(window.location, 'ancestorOrigins', {
      configurable: true,
      value: { length: 1, item: () => OTHER_ALLOWED_ORIGIN },
    });
    try {
      const host = frameInFakeHost();
      stop = startHostBridge(ALLOWED_ORIGINS);
      expect(host.sent().map(({ targetOrigin }) => targetOrigin)).toEqual([OTHER_ALLOWED_ORIGIN]);
    } finally {
      Reflect.deleteProperty(window.location, 'ancestorOrigins');
    }
  });

  it('shows the no-host error and listens to nothing when the editor is not framed', () => {
    stop = startHostBridge(ALLOWED_ORIGINS);

    expect(useEmbed.getState()).toEqual({ status: 'error', reason: 'no-host' });
    window.dispatchEvent(
      new MessageEvent('message', { data: envelope(init()), origin: HOST_ORIGIN, source: window }),
    );
    expect(useEditor.getState().session.projectId).toBe(DEFAULT_SESSION.projectId);
  });

  it('shows the no-host error and posts nothing when no host origin is allowed', () => {
    const host = frameInFakeHost();
    stop = startHostBridge([]);

    expect(useEmbed.getState()).toEqual({ status: 'error', reason: 'no-host' });
    expect(host.sent()).toEqual([]);
  });

  it('allows no host in a production build without VITE_HOST_ORIGINS, and only the configured ones with it', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_HOST_ORIGINS', '');
    const host = frameInFakeHost();
    stop = startHostBridge();

    expect(useEmbed.getState()).toEqual({ status: 'error', reason: 'no-host' });
    expect(host.sent()).toEqual([]);

    stop();
    vi.stubEnv('VITE_HOST_ORIGINS', OTHER_ALLOWED_ORIGIN);
    stop = startHostBridge();
    expect(host.sent().map(({ targetOrigin }) => targetOrigin)).toEqual([OTHER_ALLOWED_ORIGIN]);
  });

  it('reports init-timeout after 8 seconds and still accepts a late init', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.clear();

    vi.advanceTimersByTime(INIT_TIMEOUT_MS - 1);
    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
    vi.advanceTimersByTime(1);
    expect(useEmbed.getState()).toEqual({ status: 'error', reason: 'init-timeout' });
    expect(host.sent().map(({ message, targetOrigin }) => [message?.type, targetOrigin])).toEqual([
      ['error', HOST_ORIGIN],
      ['error', OTHER_ALLOWED_ORIGIN],
    ]);
    expect(host.sentOfType('error').map((message) => message.payload.code)).toEqual([
      'init-timeout',
      'init-timeout',
    ]);

    host.send(init());
    expect(useEmbed.getState().status).toBe('connected');
  });
});

describe('origin and source checks', () => {
  it('ignores init from an origin that is not allowed', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.clear();

    host.send(init(), 'https://attacker.example');
    host.send(init(), 'http://localhost:5173');

    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
    expect(useEditor.getState().items).toEqual([]);
    expect(host.sent()).toEqual([]);
  });

  it('ignores init that does not come from the parent window', () => {
    const host = frameInFakeHost();
    const stranger = document.createElement('iframe');
    document.body.append(stranger);
    stop = startHostBridge(ALLOWED_ORIGINS);

    host.deliver(envelope(init()), { source: stranger.contentWindow });
    host.deliver(envelope(init()), { source: window });
    host.deliver(envelope(init()), { source: null });

    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
    expect(useEditor.getState().session.embedded).toBe(true);
    expect(useEditor.getState().session.projectId).toBe(DEFAULT_SESSION.projectId);
  });

  it('locks to the origin that sent init', () => {
    const host = connectedHost();
    host.clear();

    host.send({ type: 'locale', payload: { locale: 'vi' } }, OTHER_ALLOWED_ORIGIN);
    host.send(init({ user: { id: 'u-9', name: 'Mallory' } }), OTHER_ALLOWED_ORIGIN);
    expect(useEditor.getState().locale).toBe('en');
    expect(useEditor.getState().session.userName).toBe('Alex Morgan');
    expect(useEmbed.getState()).toMatchObject({ hostOrigin: HOST_ORIGIN });

    host.send({ type: 'locale', payload: { locale: 'vi' } });
    expect(useEditor.getState().locale).toBe('vi');
    expect(requestQuote()).toBe(true);
    expect(host.sent().length).toBeGreaterThan(0);
    expect(host.sent().every(({ targetOrigin }) => targetOrigin === HOST_ORIGIN)).toBe(true);
  });

  it('ignores token, locale and theme messages that arrive before init', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);

    host.send({ type: 'locale', payload: { locale: 'vi' } });
    host.send({ type: 'theme', payload: NORTHWIND_THEME });
    host.send({ type: 'token', payload: { token: TOKEN, tokenExpiresAt: NOW + 60_000 } });

    expect(useEditor.getState().locale).toBe('en');
    expect(rootStyle('--color-accent')).toBe('');
    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
  });

  it('reports protocol messages that fail validation to the sender and ignores foreign ones', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.clear();

    host.deliver({ ...envelope(init()), version: 2 });
    host.deliver({ protocol: PROTOCOL, version: 1, type: 'init', payload: { locale: 'en' } });
    host.deliver({ source: 'react-devtools-content-script', payload: { hello: true } });
    host.deliver('plain string');

    expect(useEmbed.getState()).toEqual({ status: 'waiting' });
    expect(host.sent().map(({ targetOrigin }) => targetOrigin)).toEqual([HOST_ORIGIN, HOST_ORIGIN]);
    expect(host.sentOfType('error').map((message) => message.payload.code)).toEqual([
      'invalid-message',
      'invalid-message',
    ]);
  });
});

describe('init', () => {
  it('opens the host project and applies the session, locale and theme', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    const payload = initPayload({ locale: 'vi', theme: NORTHWIND_THEME });

    host.send({ type: 'init', payload });

    const state = useEditor.getState();
    expect(state.session).toEqual({
      projectId: payload.project.id,
      projectName: 'Harbor plant · Electrical room B',
      userId: 'u-1042',
      userName: 'Alex Morgan',
      embedded: true,
    });
    expect(state.items).toEqual(sampleLayout());
    expect(state.locale).toBe('vi');
    expect(state.announcement?.text).toBe('Đã kết nối với ứng dụng chủ.');
    expect(rootStyle('--color-accent')).toBe('#0b6aa2');
    expect(rootStyle('--color-focus')).toBe('#0b6aa2');
    expect(rootStyle('--color-accent-hover')).toBe('color-mix(in srgb, #0b6aa2 86%, black)');
    expect(rootStyle('--font-sans')).toMatch(/^system-ui,/);
    expect(rootStyle('--radius-md')).toBe('2px');
    expect(useEmbed.getState()).toEqual({
      status: 'connected',
      hostOrigin: HOST_ORIGIN,
      tokenExpiresAt: NOW + TOKEN_LIFETIME_MS,
    });
  });

  it('keeps the default accent when the host accent is too light for white text, and says so', () => {
    const host = connectedHost({ theme: { accent: '#ffd500', radius: 0 } });

    expect(rootStyle('--color-accent')).toBe('');
    expect(rootStyle('--radius-md')).toBe('0px');
    expect(host.sentOfType('error').map((message) => message.payload.code)).toEqual([
      'theme-rejected',
    ]);
  });

  it('keeps the open project, its undo history and the selection when the host repeats init, and takes the new names', () => {
    const payload = initPayload();
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.send({ type: 'init', payload });
    const [first] = useEditor.getState().items;
    if (!first) throw new Error('The sample layout is empty');
    select(first.id);
    moveItem(first.id, { x: first.x + 0.5, z: first.z });

    const tokenExpiresAt = Date.now() + 2 * TOKEN_LIFETIME_MS;
    host.send({
      type: 'init',
      payload: {
        ...payload,
        project: { ...payload.project, name: 'Harbor plant · Room B, renamed' },
        user: { ...payload.user, name: 'A. Morgan' },
        locale: 'vi',
        token: 'tok_AGAIN-1',
        tokenExpiresAt,
      },
    });

    const state = useEditor.getState();
    expect(state.history.past).toHaveLength(1);
    expect(state.selectedId).toBe(first.id);
    expect(state.session).toEqual({
      projectId: payload.project.id,
      projectName: 'Harbor plant · Room B, renamed',
      userId: payload.user.id,
      userName: 'A. Morgan',
      embedded: true,
    });
    expect(state.locale).toBe('vi');
    expect(useEmbed.getState()).toMatchObject({ status: 'connected', tokenExpiresAt });
    expect(toast.getToasts()).toEqual([]);
  });

  it('reopens a project when init switches back to it, with the draft notice in the host language', () => {
    const payload = initPayload();
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.send({ type: 'init', payload });
    addItem('ups', { x: 10, z: 6 });

    host.send(init());
    expect(useEditor.getState().items).toEqual(sampleLayout());
    host.send({ type: 'init', payload: { ...payload, locale: 'vi' } });

    expect(useEditor.getState().session.projectId).toBe(payload.project.id);
    expect(useEditor.getState().items).toHaveLength(sampleLayout().length + 1);
    expect(toast.getToasts()).toContainEqual(
      expect.objectContaining({ title: 'Đã khôi phục bản nháp gần nhất.' }),
    );
  });

  it('opens a separate draft for another user of the same host project', () => {
    const payload = initPayload();
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    host.send({ type: 'init', payload });
    addItem('ups', { x: 10, z: 6 });

    host.send({ type: 'init', payload: { ...payload, user: { id: 'u-2077', name: 'Sam Lee' } } });

    expect(useEditor.getState().session.userName).toBe('Sam Lee');
    expect(useEditor.getState().items).toEqual(sampleLayout());
  });

  it('replaces all earlier theme overrides with each theme message', () => {
    const host = connectedHost({ theme: NORTHWIND_THEME });

    host.send({ type: 'theme', payload: { radius: 8 } });
    expect(rootStyle('--color-accent')).toBe('');
    expect(rootStyle('--font-sans')).toBe('');
    expect(rootStyle('--radius-md')).toBe('8px');

    host.send({ type: 'theme', payload: {} });
    expect(document.documentElement.getAttribute('style') ?? '').toBe('');
  });
});

describe('token lifecycle', () => {
  it('requests a new token one minute before expiry and switches to the renewed token', () => {
    const host = connectedHost();
    host.clear();

    vi.advanceTimersByTime(TOKEN_LIFETIME_MS - TOKEN_REFRESH_LEAD_MS - 1);
    expect(host.sentOfType('token-request')).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(host.sent().map(({ message, targetOrigin }) => [message, targetOrigin])).toEqual([
      [{ type: 'token-request', payload: { reason: 'expiring' } }, HOST_ORIGIN],
    ]);

    const renewed = { token: 'tok_RENEWED-77aa', tokenExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
    host.send({ type: 'token', payload: renewed });
    expect(useEmbed.getState()).toEqual({
      status: 'connected',
      hostOrigin: HOST_ORIGIN,
      tokenExpiresAt: renewed.tokenExpiresAt,
    });

    vi.advanceTimersByTime(TOKEN_REFRESH_LEAD_MS);
    expect(useEmbed.getState().status).toBe('connected');
  });

  it('expires the session, asks for a token and reports the error when no token arrives', () => {
    const host = connectedHost();
    host.clear();

    vi.advanceTimersByTime(TOKEN_LIFETIME_MS - 1);
    expect(useEmbed.getState().status).toBe('connected');
    vi.advanceTimersByTime(1);

    expect(useEmbed.getState()).toEqual({
      status: 'expired',
      hostOrigin: HOST_ORIGIN,
      tokenExpiresAt: NOW + TOKEN_LIFETIME_MS,
    });
    expect(requestQuote()).toBe(false);
    expect(host.sent().map(({ message }) => message?.type)).toEqual([
      'token-request',
      'token-request',
      'error',
    ]);
    expect(host.sentOfType('token-request').map((message) => message.payload.reason)).toEqual([
      'expiring',
      'expired',
    ]);
    expect(host.sentOfType('error').map((message) => message.payload.code)).toEqual([
      'token-expired',
    ]);

    host.send({
      type: 'token',
      payload: { token: 'tok_LATE-1', tokenExpiresAt: Date.now() + 1000 },
    });
    expect(useEmbed.getState().status).toBe('connected');
  });

  it('ignores tokens that already expired, so a faulty host cannot start a request loop', () => {
    const host = connectedHost();
    vi.advanceTimersByTime(TOKEN_LIFETIME_MS);
    host.clear();

    host.send({ type: 'token', payload: { token: 'tok_STALE-1', tokenExpiresAt: Date.now() - 1 } });

    expect(useEmbed.getState().status).toBe('expired');
    expect(host.sent()).toEqual([]);
  });

  it('treats an init token that is already expired as expired', () => {
    const host = connectedHost({ tokenExpiresAt: NOW - 1000 });

    expect(useEmbed.getState().status).toBe('expired');
    expect(useEditor.getState().session.userName).toBe('Alex Morgan');
    expect(host.sentOfType('token-request').map((message) => message.payload.reason)).toEqual([
      'expired',
    ]);
  });

  it('asks halfway through a token with under two minutes left, so short tokens cannot start a request storm', () => {
    const host = connectedHost({ tokenExpiresAt: NOW + 30_000 });
    const requests = () => host.sentOfType('token-request').length;

    for (let round = 1; round <= 3; round += 1) {
      expect(requests()).toBe(round - 1);
      vi.advanceTimersByTime(15_000 - 1);
      expect(requests()).toBe(round - 1);
      vi.advanceTimersByTime(1);
      expect(requests()).toBe(round);
      host.send({
        type: 'token',
        payload: { token: `tok_SHORT-${String(round)}`, tokenExpiresAt: Date.now() + 30_000 },
      });
    }
    expect(useEmbed.getState().status).toBe('connected');
  });

  it.each([
    {
      lifeMs: 15_000,
      asked: [
        [7_500, 'expiring'],
        [17_500, 'expiring'],
        [27_500, 'expiring'],
      ],
    },
    {
      lifeMs: 1_000,
      asked: [
        [500, 'expiring'],
        [10_500, 'expired'],
        [20_500, 'expired'],
      ],
    },
  ])(
    'asks at most once per 10 s when the host answers every request at once with a $lifeMs ms token',
    ({ lifeMs, asked }) => {
      const host = connectedHost({ tokenExpiresAt: NOW + lifeMs });
      const seen: [number, string][] = [];

      for (let elapsed = 0; elapsed < 30_000; elapsed += 100) {
        vi.advanceTimersByTime(100);
        for (const request of host.sentOfType('token-request').slice(seen.length)) {
          seen.push([Date.now() - NOW, request.payload.reason]);
          host.send({
            type: 'token',
            payload: { token: TOKEN, tokenExpiresAt: Date.now() + lifeMs },
          });
        }
      }

      expect(seen).toEqual(asked);
    },
  );

  it('asks again at once when the token expires while its refresh request is still unanswered', () => {
    const host = connectedHost({ tokenExpiresAt: NOW + 15_000 });

    vi.advanceTimersByTime(15_000);

    expect(useEmbed.getState().status).toBe('expired');
    expect(host.sentOfType('token-request').map((message) => message.payload.reason)).toEqual([
      'expiring',
      'expired',
    ]);
  });

  it('arms no timer beyond the browser limit, so a long-lived token stays valid until its refresh', () => {
    const day = 24 * 60 * 60 * 1000;
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    const host = connectedHost({ tokenExpiresAt: NOW + 40 * day });
    host.clear();

    expect(Math.max(...setTimer.mock.calls.map(([, delay]) => delay ?? 0))).toBe(2 ** 31 - 1);
    vi.advanceTimersByTime(40 * day - TOKEN_REFRESH_LEAD_MS - 1);
    expect(useEmbed.getState().status).toBe('connected');
    expect(host.sentOfType('token-request')).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(host.sentOfType('token-request').map((message) => message.payload.reason)).toEqual([
      'expiring',
    ]);
  });

  it('stops its token timers and its content observer when the bridge stops', () => {
    const host = connectedHost();
    host.clear();

    stop();
    vi.advanceTimersByTime(TOKEN_LIFETIME_MS);

    expect(host.sent()).toEqual([]);
    expect(useEmbed.getState().status).toBe('connected');
    expect(host.observed()).toEqual([]);
  });
});

describe('reporting to the host', () => {
  it('posts the layout summary on init and once per burst of edits, 300 ms after the last', () => {
    const host = connectedHost();
    const sample = sampleLayout();
    const bom = deriveBom(sample);

    expect(host.sentOfType('layout-changed')).toEqual([
      {
        type: 'layout-changed',
        payload: {
          itemCount: sample.length,
          violationCount: findViolations(sample).length,
          bom: {
            lines: bom.lines.map(({ partNumber, quantity }) => ({ partNumber, quantity })),
            totalUsd: bom.totalUsd,
          },
        },
      },
    ]);

    host.clear();
    addItem('ups', { x: 10, z: 6 });
    vi.advanceTimersByTime(200);
    addItem('drive', { x: 14, z: 8 });
    vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS - 1);
    expect(host.sentOfType('layout-changed')).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(host.sentOfType('layout-changed').map((message) => message.payload.itemCount)).toEqual([
      sample.length + 2,
    ]);
  });

  it('posts the content height on init, then each time the app root changes size', () => {
    const root = document.createElement('div');
    root.id = 'root';
    const app = document.createElement('div');
    root.append(app);
    document.body.append(root);
    const height = vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(900);
    const host = connectedHost();
    expect(host.observed()).toEqual([app]);

    height.mockReturnValue(1240);
    host.resizeContent();
    host.resizeContent();
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
    host.resizeContent();
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);

    expect(host.sentOfType('resize').map((message) => message.payload.height)).toEqual([900, 1240]);
  });

  it('reports a crash to the connected host as an error with code crashed', () => {
    reportCrash();
    const host = connectedHost();
    host.clear();

    reportCrash();

    expect(host.sent().map(({ message, targetOrigin }) => [message, targetOrigin])).toEqual([
      [
        {
          type: 'error',
          payload: {
            code: 'crashed',
            message: 'The editor stopped working and asks the user to reload it.',
          },
        },
        HOST_ORIGIN,
      ],
    ]);
  });

  it('requestQuote flushes the pending summary, then asks the host to open the quote', () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    expect(requestQuote()).toBe(false);

    const payload = initPayload();
    host.send({ type: 'init', payload });
    host.clear();
    addItem('cabinet', { x: 12, z: 3 });

    expect(requestQuote()).toBe(true);
    expect(host.sent().map(({ message }) => message?.type)).toEqual(['layout-changed', 'navigate']);
    expect(host.sentOfType('navigate')).toEqual([
      { type: 'navigate', payload: { to: 'quote', projectId: payload.project.id } },
    ]);
  });
});

describe('token confidentiality', () => {
  it('never puts the token in the stores, storage, URL, console or outgoing messages', () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const host = connectedHost();
    addItem('ups', { x: 10, z: 6 });
    vi.advanceTimersByTime(TOKEN_LIFETIME_MS - TOKEN_REFRESH_LEAD_MS);

    expect(useEmbed.getState().status).toBe('connected');
    expect(JSON.stringify(useEditor.getState())).not.toContain(TOKEN);
    expect(JSON.stringify(useEmbed.getState())).not.toContain(TOKEN);
    const stored = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }),
    );
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.join('\n')).not.toContain(TOKEN);
    expect(document.cookie).not.toContain(TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
    expect(JSON.stringify(host.sent().map(({ data }) => data))).not.toContain(TOKEN);
    for (const spy of consoleSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
  });
});

describe('readyTargets', () => {
  it('uses every allowed origin when the parent origin is unknown or masked', () => {
    expect(readyTargets(ALLOWED_ORIGINS, null)).toEqual(ALLOWED_ORIGINS);
    expect(readyTargets(ALLOWED_ORIGINS, 'null')).toEqual(ALLOWED_ORIGINS);
  });

  it('narrows to the reported parent origin, or to nothing when it is not allowed', () => {
    expect(readyTargets(ALLOWED_ORIGINS, OTHER_ALLOWED_ORIGIN)).toEqual([OTHER_ALLOWED_ORIGIN]);
    expect(readyTargets(ALLOWED_ORIGINS, 'https://attacker.example')).toEqual([]);
  });
});
