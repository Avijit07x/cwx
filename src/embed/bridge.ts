import { create } from 'zustand';
import { getTranslator } from '../i18n/translate';
import { announce, setLocale } from '../state/actions';
import { openProject, updateSessionNames } from '../state/bootstrap';
import { selectBom, selectCommittedViolations } from '../state/selectors';
import { useEditor, type EditorState } from '../state/store';
import {
  envelope,
  isProtocolMessage,
  parseHostMessage,
  PROTOCOL_VERSION,
  type EditorErrorCode,
  type EditorMessage,
  type InitPayload,
  type LayoutSummary,
  type Theme,
} from './protocol';
import { parseHostOrigins, resolveHostOrigins } from './origins';
import { applyTheme, isReadableAccent, MIN_ACCENT_CONTRAST } from './theme';

export const INIT_TIMEOUT_MS = 8000;
export const TOKEN_REFRESH_LEAD_MS = 60_000;
const TOKEN_REQUEST_INTERVAL_MS = 10_000;
export const LAYOUT_DEBOUNCE_MS = 300;
export const RESIZE_DEBOUNCE_MS = 100;
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export type EmbedErrorReason = 'no-host' | 'init-timeout';

type EmbedState =
  | { readonly status: 'waiting' }
  | { readonly status: 'error'; readonly reason: EmbedErrorReason }
  | {
      readonly status: 'connected' | 'expired';
      readonly hostOrigin: string;
      readonly tokenExpiresAt: number;
    };

export const useEmbed = create<EmbedState>()(() => ({ status: 'waiting' }));

function setEmbed(state: EmbedState): void {
  useEmbed.setState(state, true);
}

function configuredHostOrigins(): readonly string[] {
  const configured: unknown = import.meta.env.VITE_HOST_ORIGINS;
  const value = typeof configured === 'string' ? configured : undefined;
  return import.meta.env.DEV ? resolveHostOrigins(value) : parseHostOrigins(value ?? '');
}

function contentRoot(): Element {
  return document.getElementById('root')?.firstElementChild ?? document.documentElement;
}

export function readyTargets(
  allowed: readonly string[],
  parentOrigin: string | null,
): readonly string[] {
  if (parentOrigin === null || parentOrigin === 'null') return allowed;
  return allowed.filter((origin) => origin === parentOrigin);
}

function parentOriginHint(): string | null {
  return 'ancestorOrigins' in window.location ? window.location.ancestorOrigins.item(0) : null;
}

function summarizeLayout(state: EditorState): LayoutSummary {
  const bom = selectBom(state);
  return {
    itemCount: state.items.length,
    violationCount: selectCommittedViolations(state).length,
    bom: {
      lines: bom.lines.map(({ partNumber, quantity }) => ({ partNumber, quantity })),
      totalUsd: bom.totalUsd,
    },
  };
}

function debounce(run: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule: () => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, delayMs);
    },
    flush: () => {
      if (timer === undefined) return;
      cancel();
      run();
    },
    cancel,
  };
}

function scheduleAt(time: number, run: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const delay = time - Date.now();
    if (delay <= 0) run();
    else timer = setTimeout(arm, Math.min(delay, MAX_TIMER_DELAY_MS));
  };
  arm();
  return () => {
    clearTimeout(timer);
  };
}

let active: {
  readonly stop: () => void;
  readonly requestQuote: () => boolean;
  readonly reportCrash: () => void;
} | null = null;

export function requestQuote(): boolean {
  return active?.requestQuote() ?? false;
}

export function reportCrash(): void {
  active?.reportCrash();
}

export function startHostBridge(
  allowedOrigins: readonly string[] = configuredHostOrigins(),
): () => void {
  active?.stop();
  const parent = window.parent;
  const targets = parent === window ? [] : readyTargets(allowedOrigins, parentOriginHint());
  if (targets.length === 0) {
    setEmbed({ status: 'error', reason: 'no-host' });
    return () => undefined;
  }
  setEmbed({ status: 'waiting' });

  let hostOrigin: string | null = null;
  let cancelTokenTimers: () => void = () => undefined;
  let lastTokenRequestAt = Number.NEGATIVE_INFINITY;
  let refreshUnanswered = false;
  let stopReporting: (() => void) | null = null;
  let lastHeight: number | null = null;

  const post = (
    message: EditorMessage,
    origins: readonly string[] = hostOrigin === null ? targets : [hostOrigin],
  ) => {
    for (const origin of origins) parent.postMessage(envelope(message), origin);
  };

  const reportError = (code: EditorErrorCode, message: string, origins?: readonly string[]) => {
    post({ type: 'error', payload: { code, message } }, origins);
  };

  const postLayout = () => {
    post({ type: 'layout-changed', payload: summarizeLayout(useEditor.getState()) });
  };
  const layout = debounce(postLayout, LAYOUT_DEBOUNCE_MS);

  const postSize = () => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (height === lastHeight) return;
    lastHeight = height;
    post({ type: 'resize', payload: { height } });
  };
  const size = debounce(postSize, RESIZE_DEBOUNCE_MS);

  const applyHostTheme = (theme: Theme) => {
    const { accent } = theme;
    if (accent === undefined || isReadableAccent(accent)) {
      applyTheme(theme);
      return;
    }
    applyTheme({ ...theme, accent: undefined });
    reportError(
      'theme-rejected',
      `Accent ${accent} is below ${MIN_ACCENT_CONTRAST}:1 contrast with white text; the default accent is used.`,
    );
  };

  const requestToken = (reason: 'expiring' | 'expired') => {
    lastTokenRequestAt = Date.now();
    refreshUnanswered = reason === 'expiring';
    post({ type: 'token-request', payload: { reason } });
  };

  const earliestRequestAt = (time: number) =>
    Math.max(time, lastTokenRequestAt + TOKEN_REQUEST_INTERVAL_MS);

  const expire = (tokenExpiresAt: number, origin: string) => {
    cancelTokenTimers();
    setEmbed({ status: 'expired', hostOrigin: origin, tokenExpiresAt });
    const now = Date.now();
    cancelTokenTimers = scheduleAt(refreshUnanswered ? now : earliestRequestAt(now), () => {
      requestToken('expired');
    });
    reportError('token-expired', 'The access token expired before a new one arrived.');
  };

  const acceptToken = (tokenExpiresAt: number, origin: string) => {
    cancelTokenTimers();
    const now = Date.now();
    if (tokenExpiresAt <= now) {
      expire(tokenExpiresAt, origin);
      return;
    }
    refreshUnanswered = false;
    setEmbed({ status: 'connected', hostOrigin: origin, tokenExpiresAt });
    const refreshAt = earliestRequestAt(
      Math.max(tokenExpiresAt - TOKEN_REFRESH_LEAD_MS, (now + tokenExpiresAt) / 2),
    );
    const cancelRefresh =
      refreshAt < tokenExpiresAt
        ? scheduleAt(refreshAt, () => {
            requestToken('expiring');
          })
        : () => undefined;
    const cancelExpiry = scheduleAt(tokenExpiresAt, () => {
      expire(tokenExpiresAt, origin);
    });
    cancelTokenTimers = () => {
      cancelRefresh();
      cancelExpiry();
    };
  };

  const initTimer = setTimeout(() => {
    setEmbed({ status: 'error', reason: 'init-timeout' });
    reportError(
      'init-timeout',
      `No valid init message arrived within ${INIT_TIMEOUT_MS / 1000} s.`,
    );
  }, INIT_TIMEOUT_MS);

  const connect = (init: InitPayload, origin: string) => {
    clearTimeout(initTimer);
    hostOrigin = origin;
    setLocale(init.locale);
    const { session } = useEditor.getState();
    if (session.projectId !== init.project.id || session.userId !== init.user.id) {
      openProject({
        projectId: init.project.id,
        projectName: init.project.name,
        userId: init.user.id,
        userName: init.user.name,
        embedded: true,
      });
    } else {
      updateSessionNames(init.project.name, init.user.name);
    }
    applyHostTheme(init.theme ?? {});
    acceptToken(init.tokenExpiresAt, origin);
    layout.cancel();
    postLayout();
    lastHeight = null;
    postSize();
    if (!stopReporting) {
      const unsubscribe = useEditor.subscribe((state) => state.items, layout.schedule);
      const content = new ResizeObserver(size.schedule);
      content.observe(contentRoot());
      stopReporting = () => {
        unsubscribe();
        content.disconnect();
      };
    }
    announce(getTranslator(init.locale).t('embed.connected'));
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== parent) return;
    const fromHost =
      hostOrigin === null ? targets.includes(event.origin) : event.origin === hostOrigin;
    if (!fromHost) return;
    const message = parseHostMessage(event.data);
    if (!message) {
      if (isProtocolMessage(event.data)) {
        reportError('invalid-message', 'The message failed validation and was ignored.', [
          event.origin,
        ]);
      }
      return;
    }
    if (message.type === 'init') {
      connect(message.payload, event.origin);
      return;
    }
    if (hostOrigin === null) return;
    switch (message.type) {
      case 'token':
        if (message.payload.tokenExpiresAt > Date.now()) {
          acceptToken(message.payload.tokenExpiresAt, hostOrigin);
        }
        break;
      case 'locale':
        setLocale(message.payload.locale);
        break;
      case 'theme':
        applyHostTheme(message.payload);
        break;
    }
  };

  const requestQuoteFromHost = () => {
    if (useEmbed.getState().status !== 'connected') return false;
    layout.flush();
    post({
      type: 'navigate',
      payload: { to: 'quote', projectId: useEditor.getState().session.projectId },
    });
    return true;
  };

  const stop = () => {
    window.removeEventListener('message', onMessage);
    clearTimeout(initTimer);
    cancelTokenTimers();
    layout.cancel();
    size.cancel();
    stopReporting?.();
    if (active?.stop === stop) active = null;
  };

  window.addEventListener('message', onMessage);
  active = {
    stop,
    requestQuote: requestQuoteFromHost,
    reportCrash: () => {
      reportError('crashed', 'The editor stopped working and asks the user to reload it.');
    },
  };
  post({ type: 'ready', payload: { version: PROTOCOL_VERSION } });
  return stop;
}
