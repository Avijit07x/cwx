import type { LaunchOptions } from '../config';
import { generateLayout, sampleLayout } from '../domain/seed';
import { announce, notify, tr } from './actions';
import {
  draftKey,
  loadDraft,
  loadLocalePreference,
  startAutosave,
  type AutosaveEvent,
} from './persistence';
import { DEFAULT_SESSION, replaceLayout, useEditor, type Session } from './store';

let stopAutosave: (() => void) | null = null;

function reportAutosave(event: AutosaveEvent): void {
  const t = tr();
  if (event === 'loaded-from-other-tab') announce(t.t('announce.loadedFromOtherTab'));
  else if (event === 'stopped-for-other-tab') notify('error', t.t('notice.changedInOtherTab'));
  else notify('error', t.t('notice.saveFailed'));
}

export function openProject(session: Session): void {
  stopAutosave?.();
  useEditor.setState({ session });
  const key = draftKey(session);
  const draft = loadDraft(key);
  const items = draft === 'unreadable' ? null : draft;
  replaceLayout(items ?? sampleLayout());
  stopAutosave = startAutosave(key, reportAutosave);
  useEditor.setState({ saveStatus: items ? 'saved' : 'idle' });
  if (draft === 'unreadable') notify('error', tr().t('notice.draftUnreadable'));
  else if (items) notify('info', tr().t('notice.draftRestored'));
}

export function updateSessionNames(projectName: string, userName: string): void {
  useEditor.setState((state) => ({ session: { ...state.session, projectName, userName } }));
}

export function bootstrap(options: LaunchOptions): void {
  const locale = loadLocalePreference();
  if (locale) useEditor.setState({ locale });
  if (options.perf) useEditor.setState({ showStats: true });
  if (options.seed !== null) {
    replaceLayout(generateLayout(options.seed));
    useEditor.setState({ saveStatus: 'off' });
    return;
  }
  if (options.embed) {
    useEditor.setState({ session: { ...DEFAULT_SESSION, embedded: true }, saveStatus: 'off' });
    return;
  }
  openProject(DEFAULT_SESSION);
}
