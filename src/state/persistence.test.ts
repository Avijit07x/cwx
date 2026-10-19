import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { sampleLayout } from '../domain/seed';
import { serializeLayout } from '../domain/serialize';
import type { PlacedItem } from '../domain/types';
import { hover, moveItem, select } from './actions';
import {
  draftKey,
  loadDraft,
  loadLocalePreference,
  saveLocalePreference,
  startAutosave,
  type AutosaveEvent,
} from './persistence';
import { resetEditor, useEditor } from './store';

const P1 = draftKey({ projectId: 'p1' });

let stopAutosave: (() => void) | null = null;

function autosave(
  options: { delayMs?: number; onEvent?: (event: AutosaveEvent) => void } = {},
): void {
  stopAutosave = startAutosave(P1, options.onEvent ?? vi.fn(), options.delayMs);
}

function byTag(tag: string): PlacedItem {
  const item = useEditor.getState().items.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No ${tag} in the layout`);
  return item;
}

function saveStatus() {
  return useEditor.getState().saveStatus;
}

function storageError(name: string): DOMException {
  return new DOMException(`Storage is not available (${name})`, name);
}

function saveFromOtherTab(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}

beforeEach(() => {
  window.localStorage.clear();
  resetEditor(sampleLayout());
  vi.useFakeTimers();
});

afterEach(() => {
  stopAutosave?.();
  stopAutosave = null;
  vi.useRealTimers();
});

describe('startAutosave', () => {
  test('saves once, after the edits have settled for the delay', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    autosave({ delayMs: 500 });
    const ups = byTag('UPS-01');
    moveItem(ups.id, { x: 18, z: 2.5 });
    vi.advanceTimersByTime(300);
    moveItem(ups.id, { x: 18.5, z: 2.5 });
    vi.advanceTimersByTime(300);
    expect(setItem).not.toHaveBeenCalled();
    expect(saveStatus()).toBe('pending');
    vi.advanceTimersByTime(199);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(saveStatus()).toBe('saved');
    expect(loadDraft(P1)).toEqual(useEditor.getState().items);
  });

  test('changes that do not touch the layout are not saved', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    autosave();
    select(byTag('CAB-01').id);
    hover(byTag('CAB-02').id);
    vi.runAllTimers();
    expect(setItem).not.toHaveBeenCalled();
    expect(saveStatus()).toBe('idle');
  });

  test('a pending save is written at once when the page is hidden', () => {
    autosave();
    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    window.dispatchEvent(new Event('pagehide'));
    expect(loadDraft(P1)).toEqual(useEditor.getState().items);
    expect(saveStatus()).toBe('saved');
  });

  test('a pending save is written at once when the tab goes to the background', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    autosave();
    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loadDraft(P1)).toBeNull();

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loadDraft(P1)).toEqual(useEditor.getState().items);
    expect(saveStatus()).toBe('saved');
  });

  test('stopping writes the pending save and stops listening', () => {
    autosave();
    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    const saved = useEditor.getState().items;
    stopAutosave?.();
    stopAutosave = null;
    expect(loadDraft(P1)).toEqual(saved);

    moveItem(byTag('CAB-01').id, { x: 12, z: 8 });
    vi.runAllTimers();
    window.dispatchEvent(new Event('pagehide'));
    expect(loadDraft(P1)).toEqual(saved);
    saveFromOtherTab(P1, serializeLayout([]));
    expect(useEditor.getState().items).toHaveLength(sampleLayout().length);
  });

  test('storage that refuses the write sets an error status instead of throwing, and later saves recover', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw storageError('QuotaExceededError');
    });
    autosave();
    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
    expect(saveStatus()).toBe('error');

    setItem.mockRestore();
    moveItem(byTag('UPS-01').id, { x: 18.5, z: 2.5 });
    vi.runAllTimers();
    expect(saveStatus()).toBe('saved');
    expect(loadDraft(P1)).toEqual(useEditor.getState().items);
  });

  test('reports the first failed save once, however many saves fail after it', () => {
    const onEvent = vi.fn();
    autosave({ onEvent });
    const ups = byTag('UPS-01');
    moveItem(ups.id, { x: 18, z: 2.5 });
    vi.runAllTimers();
    expect(saveStatus()).toBe('saved');
    expect(onEvent).not.toHaveBeenCalled();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw storageError('QuotaExceededError');
    });
    for (const x of [18.5, 19, 17.5]) {
      moveItem(ups.id, { x, z: 2.5 });
      vi.runAllTimers();
    }
    expect(saveStatus()).toBe('error');
    expect(onEvent.mock.calls).toEqual([['save-failed']]);
  });

  test('storage that cannot be opened at all (blocked in a third-party frame) is handled', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw storageError('SecurityError');
    });
    expect(loadDraft(P1)).toBeNull();
    expect(loadLocalePreference()).toBeNull();
    expect(() => {
      saveLocalePreference('vi');
    }).not.toThrow();
    autosave();
    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
    expect(saveStatus()).toBe('error');
  });
});

describe('another tab on the same project', () => {
  test('a tab without unsaved changes loads the draft the other tab saved, and does not write it back', () => {
    const onEvent = vi.fn();
    autosave({ onEvent });
    const fromOtherTab = sampleLayout().slice(0, 3);
    saveFromOtherTab(P1, serializeLayout(fromOtherTab));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(useEditor.getState().items).toEqual(fromOtherTab);
    expect(useEditor.getState().history).toEqual({ past: [], future: [] });
    expect(onEvent.mock.calls).toEqual([['loaded-from-other-tab']]);
    vi.runAllTimers();
    expect(setItem).not.toHaveBeenCalled();
    expect(saveStatus()).toBe('saved');

    moveItem(byTag('CAB-01').id, { x: 12, z: 8 });
    vi.runAllTimers();
    expect(loadDraft(P1)).toEqual(useEditor.getState().items);
  });

  test.each([
    [
      'this tab has an unsaved change',
      () => {
        moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
        return serializeLayout(sampleLayout().slice(0, 3));
      },
    ],
    ['the other tab saved a draft this tab cannot read', () => '{"version":2,"items":[]}'],
  ])('autosave stops instead of overwriting the other tab’s draft when %s', (_case, prepare) => {
    const onEvent = vi.fn();
    autosave({ onEvent });
    const otherDraft = prepare();
    saveFromOtherTab(P1, otherDraft);
    vi.runAllTimers();
    expect(window.localStorage.getItem(P1)).toBe(otherDraft);
    expect(useEditor.getState().items).toHaveLength(sampleLayout().length);
    expect(saveStatus()).toBe('error');
    expect(onEvent.mock.calls).toEqual([['stopped-for-other-tab']]);

    moveItem(byTag('CAB-01').id, { x: 12, z: 8 });
    vi.runAllTimers();
    window.dispatchEvent(new Event('pagehide'));
    stopAutosave?.();
    stopAutosave = null;
    expect(window.localStorage.getItem(P1)).toBe(otherDraft);
    expect(saveStatus()).toBe('error');
  });

  test('changes to other keys are ignored', () => {
    autosave();
    const shown = useEditor.getState().items;
    saveFromOtherTab(draftKey({ projectId: 'p2' }), serializeLayout([]));
    saveFromOtherTab('layout-editor:v1:locale', 'vi');
    expect(useEditor.getState().items).toBe(shown);
    expect(saveStatus()).toBe('idle');
  });
});

describe('draftKey', () => {
  test('keeps a separate draft per project', () => {
    expect(P1).toBe('layout-editor:v1:draft:p1');
    window.localStorage.setItem(P1, serializeLayout(sampleLayout()));
    expect(loadDraft(P1)).toEqual(sampleLayout());
    expect(loadDraft(draftKey({ projectId: 'p2' }))).toBeNull();
  });

  test('keeps a separate draft per user when the host names one, and the ids cannot run into each other', () => {
    const keys = [
      draftKey({ projectId: 'p1', userId: 'alice' }),
      draftKey({ projectId: 'p1', userId: 'bob' }),
      draftKey({ projectId: 'c', userId: 'a:b' }),
      draftKey({ projectId: 'b:c', userId: 'a' }),
      P1,
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('layout-editor:v1:draft:alice:p1');
  });
});

describe('loadDraft', () => {
  test('returns the saved layout, or null when there is none', () => {
    expect(loadDraft(P1)).toBeNull();
    window.localStorage.setItem(P1, serializeLayout(sampleLayout()));
    expect(loadDraft(P1)).toEqual(sampleLayout());
    expect(window.localStorage.getItem(`${P1}:unreadable`)).toBeNull();
  });

  test.each([
    ['text that is not JSON', '{"version":1,"items":['],
    ['JSON that is not a layout', '{"hello":"world"}'],
    ['a layout from another format version', JSON.stringify({ version: 2, items: [] })],
    [
      'a layout that breaks the rules',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'a', kind: 'drive', tag: 'VFD-01', x: 0.25, z: 0.25, rotation: 0 },
          { id: 'b', kind: 'drive', tag: 'vfd-01', x: 5.25, z: 0.25, rotation: 0 },
        ],
      }),
    ],
  ])('reports a corrupted draft as unreadable but keeps a copy of it: %s', (_name, raw) => {
    window.localStorage.setItem(P1, raw);
    expect(loadDraft(P1)).toBe('unreadable');
    expect(window.localStorage.getItem(`${P1}:unreadable`)).toBe(raw);
  });
});

describe('locale preference', () => {
  test('round-trips English and Vietnamese', () => {
    expect(loadLocalePreference()).toBeNull();
    saveLocalePreference('vi');
    expect(loadLocalePreference()).toBe('vi');
    saveLocalePreference('en');
    expect(loadLocalePreference()).toBe('en');
  });

  test('ignores values that are not a supported language', () => {
    window.localStorage.setItem('layout-editor:v1:locale', 'fr');
    expect(loadLocalePreference()).toBeNull();
  });
});
