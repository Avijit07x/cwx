import * as z from 'zod/mini';
import {
  envelope,
  parseEditorMessage,
  type EditorMessage,
  type HostMessage,
  type Identity,
  type LayoutSummary,
  type Theme,
  type TokenGrant,
} from '../embed/protocol';
import { formatCountdown, formatInteger, formatUsd } from '../i18n/format';
import { INTL_LOCALE, isLocale, type Locale } from '../i18n/locales';
import { hostMessages, type HostMessageKey } from './strings';

export const TOKEN_LIFETIME_MS = 120_000;
export const NORTHWIND_THEME: Theme = { accent: '#0b6aa2', fontFamily: 'system-ui', radius: 2 };
export const HOST_USER: Identity = { id: 'nw-u-1042', name: 'Alex Morgan' };
export const HOST_PROJECT: Identity = {
  id: 'nw-prj-2041',
  name: 'Harbor plant · Electrical room B',
};

const MAX_LOG_ENTRIES = 200;
const MAX_DETAIL_LENGTH = 400;
const MAX_TOASTS = 3;
const TOAST_MS = 6000;
const REDACTED = '[redacted]';

type LogDirection = 'sent' | 'received' | 'rejected';
type ConnectionState = 'waiting' | 'connected' | 'expired';

export function createMockToken(now = Date.now()): TokenGrant {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return { token, tokenExpiresAt: now + TOKEN_LIFETIME_MS };
}

export function redactTokens(value: unknown): string {
  return JSON.stringify(value, (key, field: unknown): unknown =>
    key === 'token' ? REDACTED : field,
  );
}

function isHostMessageKey(value: string | undefined): value is HostMessageKey {
  return value !== undefined && Object.hasOwn(hostMessages.en, value);
}

const typedMessage = z.object({ type: z.string() });

function messageType(data: unknown): string {
  return typedMessage.safeParse(data).data?.type ?? typeof data;
}

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`The host page is missing #${id}`);
  return found;
}

function findElements() {
  return {
    frame: element('editor-frame', HTMLIFrameElement),
    frameWarning: element('frame-warning', HTMLElement),
    crossOriginLink: element('cross-origin-link', HTMLAnchorElement),
    projectId: element('project-id', HTMLElement),
    connection: element('connection-status', HTMLElement),
    connectionText: element('connection-text', HTMLElement),
    editorOrigin: element('editor-origin', HTMLElement),
    tokenText: element('token-text', HTMLElement),
    tokenMeter: element('token-meter-fill', HTMLElement),
    rotateToken: element('rotate-token', HTMLButtonElement),
    autoRenew: element('auto-renew', HTMLInputElement),
    locale: element('locale-select', HTMLSelectElement),
    theme: element('theme-switch', HTMLInputElement),
    bomEmpty: element('bom-empty', HTMLElement),
    bomContent: element('bom-content', HTMLElement),
    bomItems: element('bom-items', HTMLElement),
    bomIssues: element('bom-issues', HTMLElement),
    bomTotal: element('bom-total', HTMLElement),
    bomLines: element('bom-lines', HTMLTableSectionElement),
    frameHeight: element('frame-height', HTMLElement),
    log: element('message-log', HTMLOListElement),
    logEmpty: element('log-empty', HTMLElement),
    clearLog: element('clear-log', HTMLButtonElement),
    toasts: element('toasts', HTMLElement),
  };
}

export function startHost(editorOrigin: string): () => void {
  const ui = findElements();
  let locale: Locale = isLocale(ui.locale.value) ? ui.locale.value : 'en';
  let grant: TokenGrant | null = null;
  let editorReady = false;
  let tokenRequestPending = false;
  let layout: LayoutSummary | null = null;
  let frameHeight: number | null = null;
  const toastTimers = new Set<ReturnType<typeof setTimeout>>();

  const t = (key: HostMessageKey, params: Readonly<Record<string, string>> = {}) =>
    hostMessages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);

  const countItems = (count: number) =>
    t(
      new Intl.PluralRules(INTL_LOCALE[locale]).select(count) === 'one'
        ? 'host.items.one'
        : 'host.items.other',
      { count: formatInteger(locale, count) },
    );

  const connectionState = (): ConnectionState => {
    if (!editorReady) return 'waiting';
    return grant !== null && grant.tokenExpiresAt <= Date.now() ? 'expired' : 'connected';
  };

  const renderConnection = () => {
    const state = connectionState();
    ui.connection.dataset.state = state;
    ui.connectionText.textContent = t(`host.connection.${state}`);
    const remainingMs = grant ? grant.tokenExpiresAt - Date.now() : 0;
    ui.tokenText.textContent = !grant
      ? t('host.token.none')
      : remainingMs > 0
        ? t('host.token.expiresIn', { time: formatCountdown(remainingMs) })
        : t('host.token.expired');
    ui.tokenMeter.style.width = `${Math.max(0, Math.min(1, remainingMs / TOKEN_LIFETIME_MS)) * 100}%`;
    ui.tokenMeter.dataset.low = String(remainingMs <= TOKEN_LIFETIME_MS / 2);
    ui.rotateToken.disabled = !editorReady;
  };

  const render = () => {
    renderConnection();
    ui.bomEmpty.hidden = layout !== null;
    ui.bomContent.hidden = layout === null;
    if (layout) {
      ui.bomItems.textContent = formatInteger(locale, layout.itemCount);
      ui.bomIssues.textContent = formatInteger(locale, layout.violationCount);
      ui.bomIssues.dataset.alert = String(layout.violationCount > 0);
      ui.bomTotal.textContent = formatUsd(locale, layout.bom.totalUsd);
      ui.bomLines.replaceChildren(
        ...layout.bom.lines.map((line) => {
          const row = document.createElement('tr');
          const part = document.createElement('td');
          part.className = 'mono';
          part.textContent = line.partNumber;
          const quantity = document.createElement('td');
          quantity.className = 'quantity num';
          quantity.textContent = formatInteger(locale, line.quantity);
          row.append(part, quantity);
          return row;
        }),
      );
    }
    ui.frameHeight.textContent =
      frameHeight === null
        ? '—'
        : t('host.bom.pixels', { value: formatInteger(locale, frameHeight) });
    ui.logEmpty.hidden = ui.log.childElementCount > 0;
  };

  const applyLocale = () => {
    document.documentElement.lang = locale;
    document.title = t('host.title');
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      if (isHostMessageKey(node.dataset.i18n)) node.textContent = t(node.dataset.i18n);
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
      if (isHostMessageKey(node.dataset.i18nLabel)) {
        node.setAttribute('aria-label', t(node.dataset.i18nLabel));
      }
    }
    ui.frame.title = t('host.frame.title');
    render();
  };

  const timeFormat = () =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    });

  const log = (direction: LogDirection, type: string, detail: unknown, note?: HostMessageKey) => {
    const now = new Date();
    const entry = document.createElement('li');
    entry.className = 'log-entry';
    entry.dataset.direction = direction;
    entry.dataset.type = type;
    const time = document.createElement('time');
    time.className = 'log-time num';
    time.dateTime = now.toISOString();
    time.textContent = timeFormat().format(now);
    const arrow = document.createElement('span');
    arrow.className = 'log-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = { sent: '→', received: '←', rejected: '×' }[direction];
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.dataset.i18n = `host.log.${direction}`;
    label.textContent = t(`host.log.${direction}`);
    const kind = document.createElement('span');
    kind.className = 'log-type';
    kind.textContent = type;
    const text = redactTokens(detail);
    const body = document.createElement('code');
    body.className = 'log-detail';
    body.textContent =
      text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}…` : text;
    entry.append(time, arrow, label, kind, body);
    if (note) {
      const remark = document.createElement('p');
      remark.className = 'log-note';
      remark.dataset.i18n = note;
      remark.textContent = t(note);
      entry.append(remark);
    }
    ui.log.prepend(entry);
    while (ui.log.childElementCount > MAX_LOG_ENTRIES) ui.log.lastElementChild?.remove();
  };

  const toast = (text: string, tone: 'info' | 'error' = 'info') => {
    const item = document.createElement('p');
    item.className = 'toast';
    item.dataset.tone = tone;
    item.textContent = text;
    ui.toasts.append(item);
    while (ui.toasts.childElementCount > MAX_TOASTS) ui.toasts.firstElementChild?.remove();
    const timer = setTimeout(() => {
      item.remove();
      toastTimers.delete(timer);
    }, TOAST_MS);
    toastTimers.add(timer);
  };

  const send = (message: HostMessage) => {
    const editor = ui.frame.contentWindow;
    if (!editor) return;
    editor.postMessage(envelope(message), editorOrigin);
    log('sent', message.type, message.payload);
  };

  const issueToken = (): TokenGrant => {
    grant = createMockToken();
    tokenRequestPending = false;
    return grant;
  };

  const sendInit = () => {
    const { token, tokenExpiresAt } = issueToken();
    send({
      type: 'init',
      payload: {
        user: HOST_USER,
        project: HOST_PROJECT,
        locale,
        token,
        tokenExpiresAt,
        theme: ui.theme.checked ? NORTHWIND_THEME : undefined,
      },
    });
  };

  const handle = (message: EditorMessage) => {
    switch (message.type) {
      case 'ready':
        editorReady = true;
        log('received', message.type, message.payload);
        sendInit();
        return;
      case 'token-request':
        tokenRequestPending = !ui.autoRenew.checked;
        log(
          'received',
          message.type,
          message.payload,
          tokenRequestPending ? 'host.log.notAnswered' : undefined,
        );
        if (!tokenRequestPending) send({ type: 'token', payload: issueToken() });
        return;
      case 'layout-changed':
        layout = message.payload;
        break;
      case 'resize':
        frameHeight = message.payload.height;
        break;
      case 'navigate': {
        const project =
          message.payload.projectId === HOST_PROJECT.id
            ? HOST_PROJECT.name
            : message.payload.projectId;
        toast(
          layout
            ? t('host.toast.quote', {
                project,
                items: countItems(layout.itemCount),
                total: formatUsd(locale, layout.bom.totalUsd),
              })
            : t('host.toast.quoteNoSummary', { project }),
        );
        break;
      }
      case 'error':
        toast(t('host.toast.error', { code: message.payload.code }), 'error');
        break;
    }
    log('received', message.type, message.payload);
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== editorOrigin || event.source !== ui.frame.contentWindow) return;
    const message = parseEditorMessage(event.data);
    if (message) handle(message);
    else log('rejected', messageType(event.data), event.data);
    render();
  };

  const onRotate = () => {
    if (!editorReady) return;
    send({ type: 'token', payload: issueToken() });
    render();
  };

  const onAutoRenew = () => {
    if (ui.autoRenew.checked && tokenRequestPending && editorReady) {
      send({ type: 'token', payload: issueToken() });
    }
    render();
  };

  const onLocale = () => {
    if (!isLocale(ui.locale.value)) return;
    locale = ui.locale.value;
    applyLocale();
    if (editorReady) send({ type: 'locale', payload: { locale } });
    render();
  };

  const onTheme = () => {
    if (editorReady) send({ type: 'theme', payload: ui.theme.checked ? NORTHWIND_THEME : {} });
    render();
  };

  const onClearLog = () => {
    ui.log.replaceChildren();
    render();
  };

  for (const node of document.querySelectorAll('.project-name'))
    node.textContent = HOST_PROJECT.name;
  ui.projectId.textContent = HOST_PROJECT.id;
  ui.editorOrigin.textContent = editorOrigin;
  applyLocale();

  if (window.location.origin === editorOrigin) {
    ui.frameWarning.hidden = false;
    ui.frame.hidden = true;
    ui.crossOriginLink.href = `http://127.0.0.1:${window.location.port}/host.html`;
    return () => undefined;
  }

  window.addEventListener('message', onMessage);
  ui.rotateToken.addEventListener('click', onRotate);
  ui.autoRenew.addEventListener('change', onAutoRenew);
  ui.locale.addEventListener('change', onLocale);
  ui.theme.addEventListener('change', onTheme);
  ui.clearLog.addEventListener('click', onClearLog);
  const ticker = setInterval(renderConnection, 1000);
  ui.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  ui.frame.src = `${editorOrigin}/?embed=1`;

  return () => {
    window.removeEventListener('message', onMessage);
    ui.rotateToken.removeEventListener('click', onRotate);
    ui.autoRenew.removeEventListener('change', onAutoRenew);
    ui.locale.removeEventListener('change', onLocale);
    ui.theme.removeEventListener('change', onTheme);
    ui.clearLog.removeEventListener('click', onClearLog);
    clearInterval(ticker);
    for (const timer of toastTimers) clearTimeout(timer);
  };
}
