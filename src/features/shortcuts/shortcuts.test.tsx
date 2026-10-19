import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ITEM_KINDS, type ItemId } from '../../domain/types';
import { beginDrag, select, startPlacement, updateDrag } from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { setCursorPoint } from '../../viewport/cursorStore';
import { HOTKEY_BINDINGS, HOTKEYS, shortcutHint, SHORTCUTS } from './shortcuts';
import { useShortcutStore } from './shortcutStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const drive = makeItem({ kind: 'drive', tag: 'VFD-01', x: 8.25, z: 6.25 });

function Harness({ onZoom }: { readonly onZoom?: () => void }) {
  useKeyboardShortcuts();
  return (
    <>
      <div role="group" tabIndex={0} aria-label="3D view" />
      <button type="button" onClick={onZoom}>
        Zoom in
      </button>
      <div role="tab" tabIndex={0} aria-selected="false">
        Assistant
      </div>
      <input aria-label="Filter" />
      <textarea aria-label="Notes" />
      <select aria-label="Units">
        <option>m</option>
      </select>
      <div contentEditable suppressContentEditableWarning aria-label="Rich text">
        <span>Editable words</span>
      </div>
      <input type="radio" aria-label="Option" />
      <p>Selectable text</p>
      <div
        tabIndex={-1}
        onKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        Handled region
      </div>
      <button
        type="button"
        aria-disabled="true"
        onKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        Unavailable tool
      </button>
      <div role="toolbar" aria-label="Edit tools">
        <button type="button">Tool</button>
      </div>
      <div role="region" tabIndex={0} aria-label="Bill of materials">
        <button type="button">Collapse</button>
      </div>
      <div role="tabpanel" tabIndex={0} aria-label="Inspect" />
      <dialog open>
        <button type="button">Inside dialog</button>
      </dialog>
      <div role="dialog" aria-label="Library dialog">
        <button type="button">Inside library dialog</button>
      </div>
    </>
  );
}

function SelectionPanel() {
  const hasSelection = useEditor((state) => state.selectedId !== null);
  return (
    <div role="group" tabIndex={-1} aria-label="Properties">
      {hasSelection && <button type="button">Duplicate</button>}
    </div>
  );
}

const editor = () => useEditor.getState();
const itemById = (id: ItemId) => editor().items.find((item) => item.id === id);
const announcement = () => editor().announcement?.text;

function press(init: KeyboardEventInit, target: Element = document.body): boolean {
  return fireEvent.keyDown(target, init);
}

function selectItem(id: ItemId | null): void {
  act(() => {
    select(id);
  });
}

beforeEach(() => {
  resetEditor([cabinet, drive]);
  useShortcutStore.setState({ helpOpen: false, singleKeys: true });
  setCursorPoint(null);
  window.getSelection()?.removeAllRanges();
});

describe('keyboard shortcut handler', () => {
  it('moves the selection one cell with the arrow keys and two cells with Shift', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    expect(press({ key: 'ArrowRight' })).toBe(false);
    expect(itemById(cabinet.id)).toMatchObject({ x: 3.5, z: 1.25 });

    press({ key: 'ArrowDown', shiftKey: true });
    expect(itemById(cabinet.id)).toMatchObject({ x: 3.5, z: 2.25 });

    press({ key: 'ArrowLeft' });
    press({ key: 'ArrowUp' });
    expect(itemById(cabinet.id)).toMatchObject({ x: 3, z: 1.75 });
    expect(announcement()).toBe('CAB-01 moved to X 3.00 m, Z 1.75 m.');
  });

  it('leaves the arrow keys to the page when nothing is selected or placed', () => {
    render(<Harness />);

    expect(press({ key: 'ArrowRight' })).toBe(true);
    expect(editor().items).toEqual([cabinet, drive]);
  });

  it('moves the placement preview with the arrow keys in place mode', () => {
    render(<Harness />);
    act(() => {
      startPlacement('drive');
    });
    const before = editor().ghost;

    press({ key: 'ArrowUp' });

    expect(before).not.toBeNull();
    expect(editor().ghost).toEqual({ x: before?.x, z: (before?.z ?? 0) - 0.5 });
  });

  it('rotates with R and Shift+R and announces the new rotation', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    expect(press({ key: 'r' })).toBe(false);
    expect(itemById(cabinet.id)?.rotation).toBe(90);
    expect(announcement()).toBe('CAB-01 rotated to 90°.');

    press({ key: 'R', shiftKey: true });
    expect(itemById(cabinet.id)).toMatchObject({ rotation: 0, x: 3, z: 1.25 });
  });

  it('deletes the selection with Delete and with Backspace', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    expect(press({ key: 'Delete' })).toBe(false);
    expect(itemById(cabinet.id)).toBeUndefined();
    expect(announcement()).toBe('Deleted CAB-01. Press Ctrl+Z to undo.');

    selectItem(drive.id);
    press({ key: 'Backspace' });
    expect(editor().items).toEqual([]);
  });

  it('undoes with Ctrl+Z or Cmd+Z and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    press({ key: 'r' });

    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(itemById(cabinet.id)?.rotation).toBe(0);

    press({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(itemById(cabinet.id)?.rotation).toBe(90);

    press({ key: 'z', metaKey: true });
    expect(itemById(cabinet.id)?.rotation).toBe(0);

    press({ key: 'z', metaKey: true, shiftKey: true });
    expect(itemById(cabinet.id)?.rotation).toBe(90);

    press({ key: 'z', ctrlKey: true });
    press({ key: 'y', ctrlKey: true });
    expect(itemById(cabinet.id)?.rotation).toBe(90);
    expect(announcement()).toBe('Redone: Rotate CAB-01.');
  });

  it('matches the character a key types, not where the key sits on the keyboard', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    press({ key: 'r' });
    press({ key: 'z', code: 'KeyY', ctrlKey: true });
    expect(itemById(cabinet.id)?.rotation).toBe(0);

    expect(press({ key: 'y', code: 'KeyZ', ctrlKey: true })).toBe(false);
    expect(itemById(cabinet.id)?.rotation).toBe(90);
    expect(announcement()).toBe('Redone: Rotate CAB-01.');

    expect(press({ key: '!', code: 'Digit1', shiftKey: true })).toBe(true);
    expect(press({ key: 'End', code: 'Numpad1' })).toBe(true);
    expect(editor().tool).toEqual({ type: 'select' });

    expect(press({ key: '1', code: 'Digit1', shiftKey: true })).toBe(false);
    expect(editor().tool).toMatchObject({ type: 'place', kind: 'cabinet' });
  });

  it('copies with Ctrl+C and pastes next to the pointer with Ctrl+V', () => {
    render(<Harness />);
    selectItem(drive.id);

    expect(press({ key: 'c', ctrlKey: true })).toBe(false);
    expect(editor().clipboard).toEqual({ kind: 'drive', rotation: 0 });

    setCursorPoint({ x: 15.25, z: 9.25 });
    expect(press({ key: 'v', ctrlKey: true })).toBe(false);
    expect(editor().items.at(-1)).toMatchObject({
      kind: 'drive',
      tag: 'VFD-02',
      x: 15.25,
      z: 9.25,
    });
  });

  it('leaves Ctrl+C to the browser while page text is selected', () => {
    render(<Harness />);
    selectItem(drive.id);
    window.getSelection()?.selectAllChildren(screen.getByText('Selectable text'));

    expect(press({ key: 'c', ctrlKey: true })).toBe(true);
    expect(editor().clipboard).toBeNull();
  });

  it('duplicates the selection with Ctrl+D', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    expect(press({ key: 'd', ctrlKey: true })).toBe(false);
    expect(editor().items).toHaveLength(3);
    expect(editor().items.at(-1)).toMatchObject({ kind: 'cabinet', tag: 'CAB-02' });
  });

  it('places at the preview with Enter and keeps placing with Shift+Enter', () => {
    render(<Harness />);
    act(() => {
      startPlacement('ups');
    });

    expect(press({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(editor().items).toHaveLength(3);
    expect(editor().tool.type).toBe('place');

    press({ key: 'Enter' });
    expect(editor().items.map((item) => item.tag)).toEqual([
      'CAB-01',
      'VFD-01',
      'UPS-01',
      'UPS-02',
    ]);
    expect(editor().tool).toEqual({ type: 'select' });

    expect(press({ key: 'Enter' })).toBe(true);
  });

  it('leaves Enter and Space to a focused button or tab instead of placing', async () => {
    const user = userEvent.setup();
    const onZoom = vi.fn();
    render(<Harness onZoom={onZoom} />);
    act(() => {
      startPlacement('ups');
    });

    screen.getByRole('button', { name: 'Zoom in' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onZoom).toHaveBeenCalledTimes(2);

    const tab = screen.getByRole('tab', { name: 'Assistant' });
    expect(press({ key: 'Enter' }, tab)).toBe(true);
    expect(press({ key: ' ' }, tab)).toBe(true);

    expect(editor().items).toEqual([cabinet, drive]);
    expect(editor().tool.type).toBe('place');
  });

  it('still places with Enter when focus is on the 3D view or the page', () => {
    render(<Harness />);
    act(() => {
      startPlacement('ups');
    });

    expect(
      press({ key: 'Enter', shiftKey: true }, screen.getByRole('group', { name: '3D view' })),
    ).toBe(false);
    expect(press({ key: 'Enter' })).toBe(false);

    expect(editor().items.map((item) => item.tag)).toEqual([
      'CAB-01',
      'VFD-01',
      'UPS-01',
      'UPS-02',
    ]);
    expect(editor().tool).toEqual({ type: 'select' });
  });

  it('leaves the arrow keys alone while an item is being dragged', () => {
    render(<Harness />);
    act(() => {
      beginDrag(cabinet.id);
      updateDrag({ x: 6, z: 4 });
    });
    const drag = editor().drag;

    expect(press({ key: 'ArrowRight' })).toBe(true);
    expect(press({ key: 'ArrowDown', shiftKey: true })).toBe(true);

    expect(editor().drag).toEqual(drag);
    expect(editor().items).toEqual([cabinet, drive]);
    expect(editor().history.past).toHaveLength(0);
  });

  it('uses Escape to cancel a drag, then placement, then clear the selection', () => {
    render(<Harness />);
    act(() => {
      select(cabinet.id);
      beginDrag(cabinet.id);
      updateDrag({ x: 6, z: 4 });
    });

    press({ key: 'Escape' });
    expect(editor().drag).toBeNull();
    expect(itemById(cabinet.id)).toMatchObject({ x: 3, z: 1.25 });
    expect(announcement()).toBe('Move cancelled.');

    act(() => {
      startPlacement('drive');
    });
    press({ key: 'Escape' });
    expect(editor().tool).toEqual({ type: 'select' });
    expect(editor().selectedId).toBe(cabinet.id);

    expect(press({ key: 'Escape' })).toBe(false);
    expect(editor().selectedId).toBeNull();
    expect(announcement()).toBe('Selection cleared.');

    expect(press({ key: 'Escape' })).toBe(true);
  });

  it('focuses the camera on the selection with F', () => {
    render(<Harness />);
    selectItem(drive.id);

    press({ key: 'f' });

    expect(editor().camera).toMatchObject({ seq: 1, focusId: drive.id });
  });

  it('zooms the 3D view in with + or = and out with -, by the character typed', () => {
    render(<Harness />);

    expect(press({ key: '+', code: 'Equal', shiftKey: true })).toBe(false);
    expect(editor().camera).toMatchObject({ seq: 1, zoom: 'in' });
    expect(press({ key: '=', code: 'Equal' })).toBe(false);
    expect(press({ key: '+', code: 'NumpadAdd' })).toBe(false);
    expect(editor().camera).toMatchObject({ seq: 3, zoom: 'in' });
    expect(press({ key: '-', code: 'Minus' })).toBe(false);
    expect(editor().camera).toMatchObject({ seq: 4, zoom: 'out' });

    expect(press({ key: '_', code: 'Minus', shiftKey: true })).toBe(true);
    expect(press({ key: '=', code: 'Equal', metaKey: true })).toBe(true);
    expect(editor().camera.seq).toBe(4);
  });

  it('starts placing each palette type with the keys 1 to 4', () => {
    render(<Harness />);

    ITEM_KINDS.forEach((kind, index) => {
      press({ key: String(index + 1) });
      expect(editor().tool).toEqual({ type: 'place', kind, rotation: 0, sticky: false });
    });
  });

  it('selects the next and previous item with ] and [', () => {
    render(<Harness />);

    press({ key: ']' });
    expect(editor().selectedId).toBe(cabinet.id);
    press({ key: ']' });
    expect(editor().selectedId).toBe(drive.id);
    press({ key: '[' });
    expect(editor().selectedId).toBe(cabinet.id);
    expect(announcement()).toBe('Selected CAB-01, Switchgear cabinet, at X 3.00 m, Z 1.25 m.');
  });

  it('opens the shortcut list with ?', () => {
    render(<Harness />);

    expect(press({ key: '?', shiftKey: true })).toBe(false);

    expect(useShortcutStore.getState().helpOpen).toBe(true);
  });

  it('does not consume edit shortcuts when there is nothing to act on', () => {
    render(<Harness />);

    expect(press({ key: 'Delete' })).toBe(true);
    expect(press({ key: 'd', ctrlKey: true })).toBe(true);
    expect(press({ key: 'r' })).toBe(true);
    expect(press({ key: 'f' })).toBe(true);
    expect(editor().items).toEqual([cabinet, drive]);
  });

  it('ignores shortcuts typed into text fields', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    selectItem(cabinet.id);

    const filter = screen.getByRole('textbox', { name: 'Filter' });
    await user.type(filter, 'r1[[f?');
    expect(filter).toHaveValue('r1[f?');
    await user.keyboard('{ArrowRight}{Delete}{Backspace}{Control>}z{/Control}');

    expect(editor().items).toEqual([cabinet, drive]);
    expect(editor().selectedId).toBe(cabinet.id);
    expect(editor().tool).toEqual({ type: 'select' });
    expect(useShortcutStore.getState().helpOpen).toBe(false);
  });

  it('ignores keys in text areas, selects, editable content and open dialogs', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    const targets = [
      screen.getByRole('textbox', { name: 'Notes' }),
      screen.getByRole('combobox', { name: 'Units' }),
      screen.getByText('Editable words'),
      screen.getByRole('button', { name: 'Inside dialog' }),
      screen.getByRole('button', { name: 'Inside library dialog' }),
    ];

    for (const target of targets) {
      expect(press({ key: 'Delete' }, target)).toBe(true);
      expect(press({ key: 'r' }, target)).toBe(true);
      expect(press({ key: 'z', ctrlKey: true }, target)).toBe(true);
    }
    expect(editor().items).toEqual([cabinet, drive]);
  });

  it('ignores every shortcut while the shortcut list is open, wherever focus is', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    useShortcutStore.setState({ helpOpen: true });

    expect(press({ key: 'r' })).toBe(true);
    expect(press({ key: 'Delete' })).toBe(true);
    expect(press({ key: 'z', ctrlKey: true })).toBe(true);
    expect(press({ key: 'Escape' })).toBe(true);

    expect(editor().items).toEqual([cabinet, drive]);
    expect(editor().selectedId).toBe(cabinet.id);
  });

  it('ignores keys during IME composition and keys another handler already used', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    press({ key: 'r', isComposing: true });
    press({ key: 'Process' });
    press({ key: 'r' }, screen.getByText('Handled region'));

    expect(itemById(cabinet.id)?.rotation).toBe(0);
  });

  it('still runs shortcuts from an unavailable control that swallows every key', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    const unavailable = screen.getByRole('button', { name: 'Unavailable tool' });

    expect(press({ key: 'r' }, unavailable)).toBe(false);
    expect(itemById(cabinet.id)?.rotation).toBe(90);
    press({ key: 'z', ctrlKey: true }, unavailable);
    expect(itemById(cabinet.id)?.rotation).toBe(0);
    press({ key: 'Enter' }, unavailable);
    expect(editor().items).toEqual([cabinet, drive]);
  });

  it('leaves arrow keys to radio buttons and toolbars but keeps other shortcuts working there', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    const radio = screen.getByRole('radio', { name: 'Option' });
    const tool = screen.getByRole('button', { name: 'Tool' });

    for (const target of [radio, tool]) {
      expect(press({ key: 'ArrowRight' }, target)).toBe(true);
      expect(press({ key: 'ArrowLeft', shiftKey: true }, target)).toBe(true);
    }
    expect(itemById(cabinet.id)?.x).toBe(3);

    press({ key: 'r' }, radio);
    press({ key: 'r' }, tool);
    expect(itemById(cabinet.id)?.rotation).toBe(180);
  });

  it('leaves the arrow keys to a focused scroll region or tab panel, not to the controls inside it', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    const region = screen.getByRole('region', { name: 'Bill of materials' });
    const panel = screen.getByRole('tabpanel', { name: 'Inspect' });

    for (const target of [region, panel]) {
      expect(press({ key: 'ArrowDown' }, target)).toBe(true);
      expect(press({ key: 'ArrowRight', shiftKey: true }, target)).toBe(true);
    }
    expect(itemById(cabinet.id)).toMatchObject({ x: 3, z: 1.25 });
    expect(editor().history.past).toHaveLength(0);

    expect(press({ key: 'ArrowRight' }, screen.getByRole('button', { name: 'Collapse' }))).toBe(
      false,
    );
    expect(itemById(cabinet.id)?.x).toBe(3.5);
  });

  it('moves focus to the nearest focusable container when a shortcut removes the focused control', () => {
    render(
      <>
        <Harness />
        <SelectionPanel />
      </>,
    );
    selectItem(cabinet.id);
    const duplicate = screen.getByRole('button', { name: 'Duplicate' });
    duplicate.focus();

    press({ key: 'Delete' }, duplicate);

    expect(itemById(cabinet.id)).toBeUndefined();
    expect(screen.getByRole('group', { name: 'Properties' })).toHaveFocus();
  });

  it('does not treat Ctrl, Cmd or Alt combinations as single-key shortcuts', () => {
    render(<Harness />);
    selectItem(cabinet.id);

    expect(press({ key: 'r', ctrlKey: true })).toBe(true);
    expect(press({ key: 'r', altKey: true })).toBe(true);
    expect(press({ key: 'f', metaKey: true })).toBe(true);
    expect(press({ key: 'z', ctrlKey: true, altKey: true })).toBe(true);

    expect(itemById(cabinet.id)?.rotation).toBe(0);
    expect(editor().camera.seq).toBe(0);
  });

  it('skips single-key shortcuts when they are switched off', () => {
    render(<Harness />);
    act(() => {
      useShortcutStore.setState({ singleKeys: false });
    });
    selectItem(cabinet.id);

    for (const key of ['r', 'f', '1', '[', ']', '+', '=', '-']) {
      expect(press({ key })).toBe(true);
    }
    expect(press({ key: 'R', shiftKey: true })).toBe(true);
    expect(press({ key: '?', shiftKey: true })).toBe(true);
    expect(itemById(cabinet.id)?.rotation).toBe(0);
    expect(editor().selectedId).toBe(cabinet.id);
    expect(editor().tool).toEqual({ type: 'select' });
    expect(editor().camera.seq).toBe(0);
    expect(useShortcutStore.getState().helpOpen).toBe(false);

    press({ key: 'ArrowRight' });
    expect(itemById(cabinet.id)?.x).toBe(3.5);
    press({ key: 'z', ctrlKey: true });
    expect(itemById(cabinet.id)?.x).toBe(3);
    press({ key: 'Delete' });
    expect(itemById(cabinet.id)).toBeUndefined();
  });

  it('turns single-key shortcuts back on without remounting', () => {
    render(<Harness />);
    selectItem(cabinet.id);
    act(() => {
      useShortcutStore.setState({ singleKeys: false });
    });
    press({ key: 'r' });
    act(() => {
      useShortcutStore.setState({ singleKeys: true });
    });
    press({ key: 'r' });

    expect(itemById(cabinet.id)?.rotation).toBe(90);
  });

  it('stops listening when the component unmounts', () => {
    const { unmount } = render(<Harness />);
    selectItem(cabinet.id);

    unmount();
    press({ key: 'Delete' });

    expect(editor().items).toEqual([cabinet, drive]);
  });
});

describe('shortcut table', () => {
  it('gives every shortcut a unique id and every hotkey exactly one owner', () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(HOTKEYS).size).toBe(HOTKEYS.length);
    expect(HOTKEY_BINDINGS.size).toBe(HOTKEYS.length);
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.combos.length).toBeGreaterThan(0);
    }
  });

  it('binds Ctrl and Cmd alike for modifier shortcuts', () => {
    const owner = (hotkey: string) => HOTKEY_BINDINGS.get(hotkey)?.shortcut.id;

    expect(owner('ctrl&z')).toBe('undo');
    expect(owner('meta&z')).toBe('undo');
    expect(owner('ctrl&shift&z')).toBe('redo');
    expect(owner('meta&shift&z')).toBe('redo');
    expect(owner('meta&y')).toBe('redo');
    expect(owner('?')).toBe('help');
    expect(owner('shift&?')).toBe('help');
    expect(owner('shift&r')).toBe('rotate-ccw');
    expect(owner('arrowup')).toBe('nudge');
    expect(owner('shift&arrowup')).toBe('nudge-far');
  });

  it('derives tooltip labels and aria-keyshortcuts from the same table', () => {
    expect(shortcutHint('undo', true)).toEqual({ label: 'Ctrl+Z', aria: 'Control+Z' });
    expect(shortcutHint('redo', true)).toEqual({
      label: 'Ctrl+Shift+Z',
      aria: 'Control+Shift+Z Control+Y',
    });
    expect(shortcutHint('delete', true)).toEqual({ label: 'Del', aria: 'Delete Backspace' });
    expect(shortcutHint('rotate-ccw', true)).toEqual({ label: 'Shift+R', aria: 'Shift+R' });
    expect(shortcutHint('pick-ups', true)).toEqual({ label: '4', aria: '4' });
  });

  it('hides single-key hints while single-key shortcuts are off', () => {
    expect(shortcutHint('rotate-cw', false)).toBeUndefined();
    expect(shortcutHint('help', false)).toBeUndefined();
    expect(shortcutHint('undo', false)).toEqual({ label: 'Ctrl+Z', aria: 'Control+Z' });
  });
});
