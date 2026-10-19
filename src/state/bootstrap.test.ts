import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LaunchOptions } from '../config';
import { generateLayout, sampleLayout } from '../domain/seed';
import { serializeLayout } from '../domain/serialize';
import type { PlacedItem } from '../domain/types';

const OPTIONS: LaunchOptions = { seed: null, perf: false, instancing: true, embed: false };

async function freshEditor() {
  vi.resetModules();
  const [bootstrapModule, store, actions, persistence, sonner] = await Promise.all([
    import('./bootstrap'),
    import('./store'),
    import('./actions'),
    import('./persistence'),
    import('sonner'),
  ]);
  const state = () => store.useEditor.getState();
  const notices = () =>
    sonner.toast
      .getToasts()
      .flatMap((shown) => ('dismiss' in shown ? [] : [{ tone: shown.type, text: shown.title }]));
  const byTag = (tag: string): PlacedItem => {
    const item = state().items.find((candidate) => candidate.tag === tag);
    if (!item) throw new Error(`No ${tag} in the layout`);
    return item;
  };
  return {
    bootstrap: bootstrapModule.bootstrap,
    openProject: bootstrapModule.openProject,
    DEFAULT_SESSION: store.DEFAULT_SESSION,
    addItem: actions.addItem,
    clearLayout: actions.clearLayout,
    moveItem: actions.moveItem,
    draftOf: (projectId: string, userId?: string) =>
      persistence.loadDraft(persistence.draftKey({ projectId, userId })),
    state,
    notices,
    byTag,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bootstrap', () => {
  test('opens the demo project with the sample layout when no draft exists', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    expect(editor.state()).toMatchObject({
      session: editor.DEFAULT_SESSION,
      saveStatus: 'idle',
      history: { past: [], future: [] },
    });
    expect(editor.notices()).toEqual([]);
    expect(editor.state().items).toEqual(sampleLayout());
  });

  test('the demo session stores no project name, so the interface can name the sample in its own language', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    expect(editor.state().session).toMatchObject({ projectId: 'demo', projectName: '' });
  });

  test('restores the saved draft and says so', async () => {
    const draft = sampleLayout().slice(0, 2);
    window.localStorage.setItem('layout-editor:v1:draft:demo', serializeLayout(draft));
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    expect(editor.state().items).toEqual(draft);
    expect(editor.state().saveStatus).toBe('saved');
    expect(editor.notices().map((notice) => notice.text)).toEqual(['Restored your last draft.']);
  });

  test('an empty saved draft stays empty instead of bringing the sample back', async () => {
    window.localStorage.setItem('layout-editor:v1:draft:demo', serializeLayout([]));
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    expect(editor.state().items).toEqual([]);
  });

  test('a corrupted draft falls back to the sample layout and survives the next save as a copy', async () => {
    const corrupted = '{"version":1,"items":[';
    window.localStorage.setItem('layout-editor:v1:draft:demo', corrupted);
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    expect(editor.state().items).toEqual(sampleLayout());
    expect(editor.state().saveStatus).toBe('idle');
    expect(editor.notices()).toEqual([
      {
        tone: 'error',
        text: 'Your saved draft could not be opened, so the sample layout is shown. A copy of the draft was kept in this browser.',
      },
    ]);

    editor.moveItem(editor.byTag('UPS-01').id, { x: 18, z: 2.5 });
    vi.advanceTimersByTime(500);
    expect(editor.draftOf('demo')).toEqual(editor.state().items);
    expect(window.localStorage.getItem('layout-editor:v1:draft:demo:unreadable')).toBe(corrupted);
  });

  test('autosaves edits to the project draft', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    editor.moveItem(editor.byTag('UPS-01').id, { x: 18, z: 2.5 });
    expect(editor.state().saveStatus).toBe('pending');
    vi.advanceTimersByTime(500);
    expect(editor.draftOf('demo')).toEqual(editor.state().items);
    expect(editor.state().saveStatus).toBe('saved');
  });

  test('tells the user when another tab saved the project while this tab had an unsaved change', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    editor.moveItem(editor.byTag('UPS-01').id, { x: 18, z: 2.5 });
    const otherTab = serializeLayout(sampleLayout().slice(0, 3));
    window.localStorage.setItem('layout-editor:v1:draft:demo', otherTab);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'layout-editor:v1:draft:demo', newValue: otherTab }),
    );
    vi.runAllTimers();
    expect(editor.state().saveStatus).toBe('error');
    expect(editor.notices()).toEqual([
      {
        tone: 'error',
        text: 'This project was changed in another tab. Changes made here are no longer saved; reload the page to continue with the latest version.',
      },
    ]);
    expect(window.localStorage.getItem('layout-editor:v1:draft:demo')).toBe(otherTab);
  });

  test('says so when another tab’s save replaces the layout of a tab without unsaved changes', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    const otherTab = serializeLayout(sampleLayout().slice(0, 3));
    window.localStorage.setItem('layout-editor:v1:draft:demo', otherTab);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'layout-editor:v1:draft:demo', newValue: otherTab }),
    );
    expect(editor.state().items).toEqual(sampleLayout().slice(0, 3));
    expect(editor.state().announcement?.text).toBe(
      'Loaded the layout saved in another tab. The selection and undo history were reset.',
    );
  });

  test('tells the user once when the browser refuses to save the draft', async () => {
    const editor = await freshEditor();
    editor.bootstrap(OPTIONS);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });
    for (const x of [18, 18.5]) {
      editor.moveItem(editor.byTag('UPS-01').id, { x, z: 2.5 });
      vi.advanceTimersByTime(500);
    }
    expect(editor.state().saveStatus).toBe('error');
    expect(editor.notices()).toEqual([
      { tone: 'error', text: 'The draft could not be saved in this browser.' },
    ]);
  });

  test('a seeded session generates the layout and is never saved', async () => {
    const editor = await freshEditor();
    editor.bootstrap({ ...OPTIONS, seed: 40 });
    expect(editor.state().items).toEqual(generateLayout(40));
    expect(editor.state().saveStatus).toBe('off');
    editor.clearLayout();
    vi.runAllTimers();
    window.dispatchEvent(new Event('pagehide'));
    expect(window.localStorage.length).toBe(0);
    expect(editor.state().saveStatus).toBe('off');
  });

  test('an embedded session waits for the host: nothing is loaded or saved before a project opens', async () => {
    const editor = await freshEditor();
    editor.bootstrap({ ...OPTIONS, embed: true });
    expect(editor.state()).toMatchObject({
      items: [],
      saveStatus: 'off',
      session: { ...editor.DEFAULT_SESSION, embedded: true },
    });
    editor.addItem('drive', { x: 1, z: 1 });
    vi.runAllTimers();
    expect(window.localStorage.length).toBe(0);
  });

  test('applies the saved language and the perf flag', async () => {
    window.localStorage.setItem('layout-editor:v1:locale', 'vi');
    window.localStorage.setItem('layout-editor:v1:draft:demo', serializeLayout(sampleLayout()));
    const editor = await freshEditor();
    editor.bootstrap({ ...OPTIONS, perf: true });
    expect(editor.state()).toMatchObject({ locale: 'vi', showStats: true });
    expect(editor.notices().map((notice) => notice.text)).toEqual([
      'Đã khôi phục bản nháp gần nhất.',
    ]);
  });
});

describe('openProject', () => {
  test('switching projects saves the previous draft at once and loads the next project', async () => {
    const editor = await freshEditor();
    editor.openProject({ ...editor.DEFAULT_SESSION, projectId: 'a', projectName: 'Room A' });
    editor.moveItem(editor.byTag('UPS-01').id, { x: 18, z: 2.5 });
    const editedA = editor.state().items;

    editor.openProject({
      projectId: 'b',
      projectName: 'Room B',
      userName: 'Alex Morgan',
      embedded: true,
    });
    expect(editor.draftOf('a')).toEqual(editedA);
    expect(editor.state().session).toEqual({
      projectId: 'b',
      projectName: 'Room B',
      userName: 'Alex Morgan',
      embedded: true,
    });
    expect(editor.state().items).toEqual(sampleLayout());
    expect(editor.state().history).toEqual({ past: [], future: [] });

    editor.moveItem(editor.byTag('VFD-01').id, { x: 5.25, z: 5.25 });
    vi.advanceTimersByTime(500);
    expect(editor.draftOf('b')).toEqual(editor.state().items);
    expect(editor.draftOf('a')).toEqual(editedA);
  });

  test('host users on the same browser keep separate drafts of the same project', async () => {
    const editor = await freshEditor();
    const project = { projectId: 'room-a', projectName: 'Room A', embedded: true };
    editor.openProject({ ...project, userId: 'alice', userName: 'Alice' });
    editor.moveItem(editor.byTag('UPS-01').id, { x: 18, z: 2.5 });
    const alicesLayout = editor.state().items;

    editor.openProject({ ...project, userId: 'bob', userName: 'Bob' });
    expect(editor.state().items).toEqual(sampleLayout());
    expect(editor.notices()).toEqual([]);
    editor.moveItem(editor.byTag('VFD-01').id, { x: 5.25, z: 5.25 });
    vi.advanceTimersByTime(500);
    expect(editor.draftOf('room-a', 'bob')).toEqual(editor.state().items);
    expect(editor.draftOf('room-a', 'alice')).toEqual(alicesLayout);
  });
});
