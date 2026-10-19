import { parseLayout, serializeLayout } from '../domain/serialize';
import type { PlacedItem } from '../domain/types';
import { isLocale, type Locale } from '../i18n/locales';
import { replaceLayout, useEditor, type Session } from './store';

export function storageKey(name: string): string {
  return `layout-editor:v1:${name}`;
}

const LOCALE_KEY = storageKey('locale');

export function draftKey({ projectId, userId }: Pick<Session, 'projectId' | 'userId'>): string {
  const parts = userId === undefined ? [projectId] : [userId, projectId];
  return storageKey(`draft:${parts.map(encodeURIComponent).join(':')}`);
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseDraft(raw: string): readonly PlacedItem[] | null {
  try {
    return parseLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadDraft(key: string): readonly PlacedItem[] | 'unreadable' | null {
  const raw = readStorage(key);
  if (raw === null) return null;
  const items = parseDraft(raw);
  if (items) return items;
  writeStorage(`${key}:unreadable`, raw);
  return 'unreadable';
}

export type AutosaveEvent = 'save-failed' | 'loaded-from-other-tab' | 'stopped-for-other-tab';

export function startAutosave(
  key: string,
  onEvent: (event: AutosaveEvent) => void,
  delayMs = 500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: readonly PlacedItem[] | null = null;
  let failureReported = false;

  const fail = () => {
    useEditor.setState({ saveStatus: 'error' });
    if (failureReported) return;
    failureReported = true;
    onEvent('save-failed');
  };

  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const saved = writeStorage(key, serializeLayout(pending));
    pending = null;
    if (saved) useEditor.setState({ saveStatus: 'saved' });
    else fail();
  };

  const unsubscribe = useEditor.subscribe(
    (state) => state.items,
    (items) => {
      pending = items;
      useEditor.setState({ saveStatus: 'pending' });
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
  );

  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const stop = () => {
    clearTimeout(timer);
    pending = null;
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', flushWhenHidden);
    window.removeEventListener('storage', followOtherTab);
  };

  const followOtherTab = (event: StorageEvent) => {
    if (event.key !== key || event.newValue === null) return;
    const items = pending ? null : parseDraft(event.newValue);
    if (!items) {
      stop();
      useEditor.setState({ saveStatus: 'error' });
      onEvent('stopped-for-other-tab');
      return;
    }
    replaceLayout(items);
    clearTimeout(timer);
    pending = null;
    useEditor.setState({ saveStatus: 'saved' });
    onEvent('loaded-from-other-tab');
  };

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', flushWhenHidden);
  window.addEventListener('storage', followOtherTab);
  return () => {
    flush();
    stop();
  };
}

export function loadLocalePreference(): Locale | null {
  const value = readStorage(LOCALE_KEY);
  return isLocale(value) ? value : null;
}

export function saveLocalePreference(locale: Locale): void {
  writeStorage(LOCALE_KEY, locale);
}
