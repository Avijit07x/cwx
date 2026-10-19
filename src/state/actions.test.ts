import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { itemRect, rectAt } from '../domain/grid';
import type { EditError } from '../domain/ops';
import { findFreeSpot } from '../domain/placement';
import type { Proposal } from '../domain/proposal';
import { isTooClose, rectGap } from '../domain/rules';
import { toItemId, type ItemId, type PlacedItem } from '../domain/types';
import { makeItem } from '../test/fixtures';
import { COPY_SHORTCUT, PASTE_SHORTCUT, UNDO_SHORTCUT } from '../platform';
import {
  acceptProposal,
  addItem,
  ALERT_TOASTER_ID,
  announce,
  beginDrag,
  cancelDrag,
  cancelTool,
  clearLayout,
  copySelection,
  duplicateSelection,
  endDrag,
  focusItem,
  focusSelection,
  hover,
  moveItem,
  notify,
  nudgeSelection,
  pasteClipboard,
  placeAtGhost,
  redo,
  rejectProposal,
  removeItem,
  removeSelection,
  renameItem,
  reportEditError,
  rotateDrag,
  rotateItem,
  rotateSelection,
  rotateTool,
  select,
  selectRelative,
  setCameraView,
  setGhost,
  setInspectorTab,
  setItemRotation,
  setLocale,
  showProposal,
  startPlacement,
  toggleStats,
  turnCamera,
  undo,
  updateDrag,
  zoomCamera,
} from './actions';
import { loadLocalePreference } from './persistence';
import { selectViolations } from './selectors';
import { replaceLayout, resetEditor, useEditor } from './store';

const CAB = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const VFD = makeItem({ kind: 'drive', tag: 'VFD-01', x: 3.25, z: 3.75 });
const UPS = makeItem({ kind: 'ups', tag: 'UPS-01', x: 17.5, z: 2.5 });
const LAYOUT: readonly PlacedItem[] = [CAB, VFD, UPS];

const PROPOSAL: Proposal = {
  id: 'proposal-1',
  violationsBefore: 1,
  violationsAfter: 0,
  moves: [
    {
      id: UPS.id,
      tag: 'UPS-01',
      from: { x: 17.5, z: 2.5, rotation: 0 },
      to: { x: 18, z: 4.5, rotation: 0 },
    },
    {
      id: VFD.id,
      tag: 'VFD-01',
      from: { x: 3.25, z: 3.75, rotation: 0 },
      to: { x: 4.25, z: 3.75, rotation: 90 },
    },
  ],
};

const state = () => useEditor.getState();

function current(id: ItemId): PlacedItem {
  const item = state().items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${id} is not in the layout`);
  return item;
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value');
  return value;
}

function announced(): string | undefined {
  return state().announcement?.text;
}

function tags(): string[] {
  return state().items.map((item) => item.tag);
}

function notices() {
  return toast
    .getToasts()
    .flatMap((shown) => ('dismiss' in shown ? [] : [{ tone: shown.type, text: shown.title }]));
}

function packedDrives(): PlacedItem[] {
  return Array.from({ length: 20 * 12 }, (_, index) =>
    makeItem({
      kind: 'drive',
      tag: `P-${String(index)}`,
      x: 0.25 + (index % 20),
      z: 0.25 + Math.floor(index / 20),
    }),
  );
}

beforeEach(() => {
  resetEditor(LAYOUT);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addItem', () => {
  test('snaps, auto-tags, commits one undo step, selects the item and announces it', () => {
    resetEditor([]);
    const id = required(addItem('cabinet', { x: 3.1, z: 1.3 }));
    expect(current(id)).toEqual({ id, kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25, rotation: 0 });
    expect(state().selectedId).toBe(id);
    expect(state().history.past.map((tx) => tx.label)).toEqual([
      { action: 'add', subject: 'CAB-01' },
    ]);
    expect(announced()).toBe('Placed CAB-01 at X 3.00 m, Z 1.25 m.');
    expect(current(required(addItem('cabinet', { x: 8, z: 1.25 }))).tag).toBe('CAB-02');
  });

  test('places with the rotated footprint', () => {
    const id = required(addItem('cabinet', { x: 10, z: 6 }, 90));
    expect(current(id)).toMatchObject({ rotation: 90, x: 10.25, z: 6 });
  });

  test('the announcement names the item it is too close to', () => {
    addItem('drive', { x: 4.25, z: 3.75 });
    expect(announced()).toBe('Placed VFD-02 at X 4.25 m, Z 3.75 m. Too close to VFD-01.');
  });

  test('a point outside the room is clamped against the walls', () => {
    const id = required(addItem('drive', { x: -5, z: 50 }));
    expect(current(id)).toMatchObject({ x: 0.25, z: 11.75 });
  });
});

describe('moveItem and nudgeSelection', () => {
  test('moveItem snaps the target, commits, keeps the item selected and announces', () => {
    expect(moveItem(CAB.id, { x: 6.2, z: 4.9 })?.status).toBe('applied');
    expect(current(CAB.id)).toMatchObject({ x: 6, z: 4.75 });
    expect(state().selectedId).toBe(CAB.id);
    expect(state().history.past.at(-1)?.label).toEqual({ action: 'move', subject: 'CAB-01' });
    expect(announced()).toBe('CAB-01 moved to X 6.00 m, Z 4.75 m.');
  });

  test('moving to the current cell changes nothing and records nothing', () => {
    expect(moveItem(CAB.id, { x: 3.1, z: 1.2 })?.status).toBe('unchanged');
    expect(state().items).toBe(LAYOUT);
    expect(state().history.past).toEqual([]);
    expect(announced()).toBeUndefined();
  });

  test('moveItem ignores unknown items', () => {
    expect(moveItem(toItemId('missing'), { x: 1, z: 1 })).toBeNull();
  });

  test('nudgeSelection moves the selection one 0.5 m cell per step in room directions', () => {
    select(VFD.id);
    nudgeSelection(1, 0);
    expect(current(VFD.id)).toMatchObject({ x: 3.75, z: 3.75 });
    nudgeSelection(0, -1);
    expect(current(VFD.id)).toMatchObject({ x: 3.75, z: 3.25 });
    nudgeSelection(-2, 2);
    expect(current(VFD.id)).toMatchObject({ x: 2.75, z: 4.25 });
    expect(state().history.past).toHaveLength(3);
  });

  test('nudging into a wall says so and records nothing', () => {
    const atWall = makeItem({ kind: 'drive', tag: 'VFD-09', x: 0.25, z: 5.25 });
    resetEditor([atWall]);
    select(atWall.id);
    nudgeSelection(-1, 0);
    expect(announced()).toBe('VFD-09 is already against the wall.');
    expect(state().history.past).toEqual([]);
    nudgeSelection(0, 1);
    expect(current(atWall.id)).toMatchObject({ x: 0.25, z: 5.75 });
  });

  test('nudgeSelection does nothing without a selection', () => {
    nudgeSelection(1, 0);
    expect(state().items).toBe(LAYOUT);
    expect(state().history.past).toEqual([]);
  });
});

describe('rotation', () => {
  test('setItemRotation turns the item in place on the grid, as one undo step, and announces it', () => {
    setItemRotation(CAB.id, 90);
    expect(current(CAB.id)).toMatchObject({ rotation: 90, x: 2.75, z: 1 });
    expect(state().history.past.at(-1)?.label).toEqual({ action: 'rotate', subject: 'CAB-01' });
    expect(announced()).toBe('CAB-01 rotated to 90°.');
    undo();
    expect(current(CAB.id)).toEqual(CAB);
  });

  test('setting the current rotation records nothing', () => {
    setItemRotation(CAB.id, 0);
    expect(state().history.past).toEqual([]);
  });

  test('rotateItem turns clockwise or counter-clockwise', () => {
    rotateItem(CAB.id);
    expect(current(CAB.id).rotation).toBe(90);
    rotateItem(CAB.id, -1);
    rotateItem(CAB.id, -1);
    expect(current(CAB.id).rotation).toBe(270);
  });

  test('rotateSelection turns the selection, the tool while placing, or the preview while dragging', () => {
    select(CAB.id);
    rotateSelection();
    expect(current(CAB.id).rotation).toBe(90);

    startPlacement('transformer');
    rotateSelection();
    expect(state().tool).toMatchObject({ type: 'place', kind: 'transformer', rotation: 90 });
    expect(current(CAB.id).rotation).toBe(90);
    cancelTool();

    beginDrag(VFD.id);
    rotateSelection(-1);
    expect(state().drag?.rotation).toBe(270);
    expect(current(VFD.id).rotation).toBe(0);
  });
});

describe('renameItem', () => {
  test('renames with a trimmed tag as one undoable step, without a notice', () => {
    expect(renameItem(CAB.id, '  MAIN-01 ').status).toBe('applied');
    expect(current(CAB.id).tag).toBe('MAIN-01');
    expect(state().history.past.at(-1)?.label).toEqual({ action: 'rename', subject: 'MAIN-01' });
    undo();
    expect(current(CAB.id).tag).toBe('CAB-01');
    expect(notices()).toEqual([]);
  });

  test.each<[string, string, EditError]>([
    [
      'a tag used by another item, ignoring case',
      'vfd-01',
      { code: 'duplicate-tag', id: CAB.id, tag: 'vfd-01' },
    ],
    ['an empty tag', '   ', { code: 'empty-tag', id: CAB.id }],
    ['a tag over 24 characters', 'X'.repeat(25), { code: 'tag-too-long', id: CAB.id }],
  ])(
    'rejects %s and leaves item, history, notices and announcements alone',
    (_name, tag, error) => {
      expect(renameItem(CAB.id, tag)).toEqual({ status: 'rejected', error });
      expect(current(CAB.id).tag).toBe('CAB-01');
      expect(state().history.past).toEqual([]);
      expect(notices()).toEqual([]);
      expect(announced()).toBeUndefined();
    },
  );

  test('renaming to the same tag records and announces nothing', () => {
    expect(renameItem(CAB.id, 'CAB-01')).toEqual({ status: 'unchanged' });
    expect(state().history.past).toEqual([]);
    expect(announced()).toBeUndefined();
  });

  test('an applied rename is announced with the old and the stored new tag, in the UI language', () => {
    renameItem(CAB.id, ' MAIN​-01 ');
    expect(announced()).toBe('Renamed CAB-01 to MAIN-01.');
    setLocale('vi');
    renameItem(CAB.id, 'MAIN-02');
    expect(announced()).toBe('Đã đổi tên MAIN-01 thành MAIN-02.');
  });

  test('the undo label names the tag as it is stored, without invisible characters', () => {
    expect(renameItem(CAB.id, 'MAIN\u200b-01').status).toBe('applied');
    expect(current(CAB.id).tag).toBe('MAIN-01');
    expect(state().history.past.at(-1)?.label).toEqual({ action: 'rename', subject: 'MAIN-01' });
  });
});

describe('removing', () => {
  test('removeItem deletes the item, clears selection, hover and drag on it, and announces the undo key', () => {
    hover(VFD.id);
    beginDrag(VFD.id);
    removeItem(VFD.id);
    expect(tags()).toEqual(['CAB-01', 'UPS-01']);
    expect(state()).toMatchObject({ selectedId: null, hoveredId: null, drag: null });
    expect(announced()).toBe(`Deleted VFD-01. Press ${UNDO_SHORTCUT} to undo.`);
  });

  test('undo puts the item back at its index and selects it again; redo removes it again', () => {
    select(VFD.id);
    removeItem(VFD.id);
    undo();
    expect(state().items).toEqual(LAYOUT);
    expect(state().selectedId).toBe(VFD.id);
    expect(announced()).toBe('Undone: Delete VFD-01.');
    redo();
    expect(tags()).toEqual(['CAB-01', 'UPS-01']);
    expect(state().selectedId).toBeNull();
    expect(announced()).toBe('Redone: Delete VFD-01.');
  });

  test('removeItem can select another item as part of the same undoable step', () => {
    select(VFD.id);
    removeItem(VFD.id, UPS.id);
    expect(state().selectedId).toBe(UPS.id);
    undo();
    expect(state().selectedId).toBe(VFD.id);
    redo();
    expect(state().selectedId).toBe(UPS.id);
  });

  test('removing another item keeps the current selection', () => {
    select(CAB.id);
    removeItem(UPS.id);
    expect(state().selectedId).toBe(CAB.id);
  });

  test('removeSelection removes the selected item and does nothing without a selection', () => {
    removeSelection();
    expect(state().items).toBe(LAYOUT);
    select(UPS.id);
    removeSelection();
    expect(tags()).toEqual(['CAB-01', 'VFD-01']);
  });
});

describe('duplicate, copy and paste', () => {
  test('duplicateSelection places a copy with the next tag at the nearest free spot and selects it', () => {
    select(CAB.id);
    const id = required(duplicateSelection());
    expect(current(id)).toMatchObject({
      kind: 'cabinet',
      rotation: 0,
      tag: 'CAB-02',
      x: 5,
      z: 1.25,
    });
    expect(state().selectedId).toBe(id);
    expect(selectViolations(state())).toEqual([]);
    expect(announced()).toBe('Duplicated CAB-01 as CAB-02.');
    undo();
    expect(state().items).toEqual(LAYOUT);
    expect(state().selectedId).toBe(CAB.id);
  });

  test('duplicateSelection without a selection does nothing', () => {
    expect(duplicateSelection()).toBeNull();
    expect(state().history.past).toEqual([]);
  });

  test('copy, then paste near a point, adds a new item at the nearest free spot to that point', () => {
    select(CAB.id);
    copySelection();
    expect(state().clipboard).toEqual({ kind: 'cabinet', rotation: 0 });
    expect(announced()).toBe(`Copied CAB-01. Press ${PASTE_SHORTCUT} to paste a new one.`);
    const id = required(pasteClipboard({ x: 10, z: 6 }));
    expect(current(id)).toMatchObject({ kind: 'cabinet', tag: 'CAB-02', x: 10, z: 5.75 });
    expect(state().selectedId).toBe(id);
    expect(state().history.past.map((tx) => tx.label)).toEqual([
      { action: 'paste', subject: 'CAB-02' },
    ]);
    expect(announced()).toBe('Pasted CAB-02 at X 10.00 m, Z 5.75 m.');
  });

  test('paste without a point lands next to the selection, and every paste is a new item', () => {
    select(CAB.id);
    copySelection();
    const first = required(pasteClipboard());
    const second = required(pasteClipboard());
    expect(first).not.toBe(second);
    expect(tags()).toEqual(['CAB-01', 'VFD-01', 'UPS-01', 'CAB-02', 'CAB-03']);
    expect(selectViolations(state())).toEqual([]);
    expect(Math.hypot(current(first).x - CAB.x, current(first).z - CAB.z)).toBeLessThan(2);
  });

  test('pasting with an empty clipboard explains how to copy', () => {
    expect(pasteClipboard()).toBeNull();
    expect(announced()).toBe(`Nothing to paste. Select an item and press ${COPY_SHORTCUT} first.`);
    expect(state().history.past).toEqual([]);
  });

  test('duplicate and paste report when no spot meets the clearance', () => {
    const packed = packedDrives();
    resetEditor(packed);
    select(required(packed[0]).id);
    expect(duplicateSelection()).toBeNull();
    copySelection();
    expect(pasteClipboard({ x: 10, z: 6 })).toBeNull();
    const message = 'Variable frequency drive: no free space left that meets the clearance rule.';
    expect(notices()).toEqual([
      { tone: 'info', text: message },
      { tone: 'info', text: message },
    ]);
    expect(state().history.past).toEqual([]);
  });
});

describe('clearLayout', () => {
  test('removes everything in one undo step and clears selection, hover and proposal', () => {
    select(CAB.id);
    hover(VFD.id);
    showProposal(PROPOSAL);
    clearLayout();
    expect(state()).toMatchObject({ items: [], selectedId: null, hoveredId: null, proposal: null });
    expect(state().history.past.map((tx) => tx.label)).toEqual([{ action: 'clear', count: 3 }]);
    expect(announced()).toBe(`Layout cleared. Press ${UNDO_SHORTCUT} to undo.`);
    undo();
    expect(state().items).toEqual(LAYOUT);
    expect(state().selectedId).toBe(CAB.id);
    redo();
    expect(state().items).toEqual([]);
  });

  test('clearing an empty layout records nothing', () => {
    resetEditor([]);
    clearLayout();
    expect(state().history.past).toEqual([]);
    expect(announced()).toBeUndefined();
  });
});

describe('selection and hover', () => {
  test('select sets the selection and ignores unknown ids', () => {
    select(UPS.id);
    expect(state().selectedId).toBe(UPS.id);
    select(toItemId('missing'));
    expect(state().selectedId).toBeNull();
  });

  test('select announces only when asked', () => {
    select(CAB.id);
    expect(announced()).toBeUndefined();
    select(CAB.id, { announce: true });
    expect(announced()).toBe('Selected CAB-01, Switchgear cabinet, at X 3.00 m, Z 1.25 m.');
    select(null, { announce: true });
    expect(announced()).toBe('Selection cleared.');
  });

  test('selectRelative steps through the list in order and wraps around', () => {
    selectRelative(1);
    expect(state().selectedId).toBe(CAB.id);
    selectRelative(1);
    selectRelative(1);
    expect(state().selectedId).toBe(UPS.id);
    selectRelative(1);
    expect(state().selectedId).toBe(CAB.id);
    selectRelative(-1);
    expect(state().selectedId).toBe(UPS.id);
    select(null);
    selectRelative(-1);
    expect(state().selectedId).toBe(UPS.id);
    expect(announced()).toBe('Selected UPS-01, UPS unit, at X 17.50 m, Z 2.50 m.');
  });

  test('selectRelative does nothing in an empty layout', () => {
    resetEditor([]);
    selectRelative(1);
    expect(state().selectedId).toBeNull();
  });

  test('hover only notifies subscribers when the hovered item changes', () => {
    const listener = vi.fn();
    const unsubscribe = useEditor.subscribe(listener);
    hover(CAB.id);
    hover(CAB.id);
    hover(null);
    hover(null);
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(state().hoveredId).toBeNull();
  });
});

describe('placement', () => {
  test('startPlacement enters place mode with a ghost at a free spot near the room centre', () => {
    startPlacement('drive');
    expect(state().tool).toEqual({ type: 'place', kind: 'drive', rotation: 0, sticky: false });
    expect(state().ghost).toEqual({ x: 9.75, z: 5.75 });
    expect(announced()).toBe(
      'Placing: Variable frequency drive. Move it with the mouse or the arrow keys, press Enter to place it, Escape to cancel.',
    );
  });

  test('with a selection the ghost starts at the free spot nearest to it', () => {
    select(UPS.id);
    startPlacement('drive', { sticky: true });
    expect(state().tool).toMatchObject({ sticky: true });
    expect(state().ghost).toEqual(findFreeSpot('drive', 0, LAYOUT, UPS));
  });

  test('setGhost snaps the point, ignores repeats within a cell and does nothing outside place mode', () => {
    setGhost({ x: 3, z: 3 });
    expect(state().ghost).toBeNull();
    startPlacement('drive');
    setGhost({ x: 2.1, z: 7.9 });
    expect(state().ghost).toEqual({ x: 2.25, z: 7.75 });
    const listener = vi.fn();
    const unsubscribe = useEditor.subscribe(listener);
    setGhost({ x: 2.2, z: 7.8 });
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  test('rotateTool turns the tool, and the ghost pivots as a placed item does', () => {
    startPlacement('cabinet');
    setGhost({ x: 6, z: 6.25 });
    expect(state().ghost).toEqual({ x: 6, z: 6.25 });
    rotateTool();
    expect(state().tool).toMatchObject({ rotation: 90 });
    expect(state().ghost).toEqual({ x: 5.75, z: 6 });
  });

  test('rotateTool announces where the turned preview is, in the UI language', () => {
    startPlacement('cabinet');
    setGhost({ x: 6, z: 6.25 });
    rotateTool();
    expect(announced()).toBe('Switchgear cabinet preview rotated to 90°, at X 5.75 m, Z 6.00 m.');
    setLocale('vi');
    rotateTool(-1);
    expect(state().ghost).toEqual({ x: 6, z: 6.25 });
    expect(announced()).toBe('Bản xem trước Tủ đóng cắt đã xoay 0°, tại X 6,00 m, Z 6,25 m.');
  });

  test('turning the preview keeps it on the wall it touches, and four turns bring it back', () => {
    startPlacement('cabinet');
    setGhost({ x: 10, z: 0.25 });
    const stops = Array.from({ length: 4 }, () => {
      rotateTool();
      return state().ghost;
    });
    expect(stops).toEqual([
      { x: 9.75, z: 0.5 },
      { x: 10, z: 0.25 },
      { x: 9.75, z: 0.5 },
      { x: 10, z: 0.25 },
    ]);
    setGhost({ x: 11, z: 2.75 });
    for (let step = 0; step < 4; step++) rotateTool(-1);
    expect(state().ghost).toEqual({ x: 11, z: 2.75 });
  });

  test('in place mode the arrow keys move the ghost, not the selection', () => {
    select(CAB.id);
    startPlacement('drive');
    setGhost({ x: 5.25, z: 5.25 });
    nudgeSelection(1, 0);
    expect(state().ghost).toEqual({ x: 5.75, z: 5.25 });
    expect(current(CAB.id)).toEqual(CAB);
    expect(announced()).toBe('X 5.75 m, Z 5.25 m.');
  });

  test('an arrow key that cannot move the ghost says it is against the wall, in the UI language', () => {
    startPlacement('drive');
    setGhost({ x: 0.25, z: 5.25 });
    nudgeSelection(-1, 0);
    expect(state().ghost).toEqual({ x: 0.25, z: 5.25 });
    expect(announced()).toBe('The preview is already against the wall, at X 0.25 m, Z 5.25 m.');
    setLocale('vi');
    nudgeSelection(-1, 0);
    expect(announced()).toBe('Bản xem trước đã sát tường, tại X 0,25 m, Z 5,25 m.');
    nudgeSelection(1, 0);
    expect(announced()).toBe('X 0,75 m, Z 5,25 m.');
  });

  test('placeAtGhost places at the ghost, selects the item and returns to select mode', () => {
    startPlacement('ups');
    setGhost({ x: 10, z: 8 });
    const id = required(placeAtGhost());
    expect(current(id)).toMatchObject({ kind: 'ups', tag: 'UPS-02', x: 10, z: 8 });
    expect(state()).toMatchObject({ selectedId: id, tool: { type: 'select' }, ghost: null });
    expect(state().history.past).toHaveLength(1);
  });

  test('keepPlacing and sticky placement stay in place mode with the ghost on the next free spot', () => {
    startPlacement('drive');
    setGhost({ x: 10.25, z: 8.25 });
    required(placeAtGhost({ keepPlacing: true }));
    expect(state().tool).toMatchObject({ type: 'place', kind: 'drive' });
    const ghost = required(state().ghost);
    expect(ghost).not.toEqual({ x: 10.25, z: 8.25 });
    const ghostRect = rectAt('drive', 0, ghost.x, ghost.z);
    expect(state().items.every((item) => !isTooClose(rectGap(ghostRect, itemRect(item)).gap))).toBe(
      true,
    );

    cancelTool();
    startPlacement('drive', { sticky: true });
    required(placeAtGhost());
    expect(state().tool.type).toBe('place');
    expect(state().history.past).toHaveLength(2);
  });

  test('cancelTool leaves place mode and reports whether it did anything', () => {
    expect(cancelTool()).toBe(false);
    startPlacement('drive');
    expect(cancelTool()).toBe(true);
    expect(state()).toMatchObject({ tool: { type: 'select' }, ghost: null });
    expect(announced()).toBe('Placement cancelled.');
  });

  test('placeAtGhost does nothing outside place mode', () => {
    expect(placeAtGhost()).toBeNull();
    expect(state().history.past).toEqual([]);
  });
});

describe('dragging', () => {
  test('a whole drag is one transaction: the preview updates live and only the release commits', () => {
    beginDrag(VFD.id);
    expect(state().drag).toEqual({ id: VFD.id, x: 3.25, z: 3.75, rotation: 0 });
    expect(state().selectedId).toBe(VFD.id);
    for (const x of [3.6, 4.1, 4.9, 5.6, 6.3]) updateDrag({ x, z: 5.1 });
    expect(state().items).toBe(LAYOUT);
    expect(state().history.past).toEqual([]);
    expect(state().drag).toMatchObject({ x: 6.25, z: 5.25 });
    endDrag();
    expect(state().drag).toBeNull();
    expect(current(VFD.id)).toMatchObject({ x: 6.25, z: 5.25 });
    expect(state().history.past.map((tx) => tx.label)).toEqual([
      { action: 'move', subject: 'VFD-01' },
    ]);
    expect(announced()).toBe('VFD-01 moved to X 6.25 m, Z 5.25 m.');
    undo();
    expect(current(VFD.id)).toEqual(VFD);
  });

  test('updateDrag snaps the point and only updates state when the snapped cell changes', () => {
    beginDrag(VFD.id);
    updateDrag({ x: 5.1, z: 3.8 });
    const preview = state().drag;
    expect(preview).toMatchObject({ x: 5.25, z: 3.75 });
    updateDrag({ x: 5.2, z: 3.7 });
    expect(state().drag).toBe(preview);
  });

  test('turning during a drag commits position and rotation together as one step', () => {
    beginDrag(CAB.id);
    updateDrag({ x: 6, z: 6.25 });
    rotateDrag();
    endDrag();
    expect(current(CAB.id)).toMatchObject({ rotation: 90, x: 5.75, z: 6 });
    expect(state().history.past).toHaveLength(1);
    undo();
    expect(current(CAB.id)).toEqual(CAB);
  });

  test.each([
    ['a square item', UPS],
    ['an oblong item that re-snaps when it turns', CAB],
  ])('a drag that only turns %s is recorded and announced as a rotation', (_name, item) => {
    beginDrag(item.id);
    rotateDrag();
    endDrag();
    expect(current(item.id).rotation).toBe(90);
    expect(state().history.past.map((tx) => tx.label)).toEqual([
      { action: 'rotate', subject: item.tag },
    ]);
    expect(announced()).toBe(`${item.tag} rotated to 90°.`);
    undo();
    expect(current(item.id)).toEqual(item);
  });

  test('releasing without moving records nothing', () => {
    beginDrag(CAB.id);
    updateDrag({ x: 3.1, z: 1.3 });
    endDrag();
    expect(state().drag).toBeNull();
    expect(state().history.past).toEqual([]);
  });

  test('cancelDrag drops the preview without committing', () => {
    beginDrag(CAB.id);
    updateDrag({ x: 8, z: 8 });
    expect(cancelDrag()).toBe(true);
    expect(state().drag).toBeNull();
    expect(state().items).toBe(LAYOUT);
    expect(announced()).toBe('Move cancelled.');
    expect(cancelDrag()).toBe(false);
  });

  test('undo during a drag only cancels the drag', () => {
    moveItem(UPS.id, { x: 15, z: 8 });
    beginDrag(CAB.id);
    updateDrag({ x: 8, z: 8 });
    undo();
    expect(state().drag).toBeNull();
    expect(current(CAB.id)).toEqual(CAB);
    expect(current(UPS.id)).toMatchObject({ x: 15, z: 8 });
    expect(state().history.past).toHaveLength(1);
    undo();
    expect(current(UPS.id)).toEqual(UPS);
  });

  test('redo during a drag only cancels the drag', () => {
    moveItem(UPS.id, { x: 15, z: 8 });
    undo();
    beginDrag(CAB.id);
    updateDrag({ x: 8, z: 8 });
    redo();
    expect(state().drag).toBeNull();
    expect(current(UPS.id)).toEqual(UPS);
    expect(state().history.future).toHaveLength(1);
  });

  test('deleting the dragged item ends the drag cleanly', () => {
    beginDrag(CAB.id);
    updateDrag({ x: 8, z: 8 });
    removeItem(CAB.id);
    expect(state().drag).toBeNull();
    endDrag();
    expect(state().history.past).toHaveLength(1);
  });
});

describe('assistant proposals', () => {
  test('accepting applies every move as one transaction, and one undo restores them all', () => {
    showProposal(PROPOSAL);
    expect(state().proposal).toBe(PROPOSAL);
    expect(acceptProposal()).toBe('applied');
    expect(current(UPS.id)).toMatchObject({ x: 18, z: 4.5 });
    expect(current(VFD.id)).toMatchObject({ x: 4.25, z: 3.75, rotation: 90 });
    expect(state().proposal).toBeNull();
    expect(state().history.past.map((tx) => tx.label)).toEqual([{ action: 'assistant', count: 2 }]);
    expect(announced()).toBe(`Assistant change applied. Press ${UNDO_SHORTCUT} to undo.`);
    undo();
    expect(state().items).toEqual(LAYOUT);
    expect(announced()).toBe('Undone: Assistant change (2 moves).');
    redo();
    expect(current(UPS.id)).toMatchObject({ x: 18, z: 4.5 });
  });

  test('accepting with announce: false applies the change without a live-region message', () => {
    showProposal(PROPOSAL);
    expect(acceptProposal({ announce: false })).toBe('applied');
    expect(current(UPS.id)).toMatchObject({ x: 18, z: 4.5 });
    expect(state().history.past).toHaveLength(1);
    expect(state().announcement).toBeNull();
  });

  test('a proposal that would change nothing reports unchanged and records no step', () => {
    showProposal({
      ...PROPOSAL,
      moves: PROPOSAL.moves.map((move) => ({ ...move, to: move.from })),
    });
    expect(acceptProposal()).toBe('unchanged');
    expect(state().items).toBe(LAYOUT);
    expect(state().history.past).toEqual([]);
    expect(state().proposal).toBeNull();
    expect(state().announcement).toBeNull();
    expect(notices()).toEqual([]);
  });

  test('a proposal whose items changed is stale and cannot be accepted', () => {
    showProposal(PROPOSAL);
    moveItem(VFD.id, { x: 6.25, z: 3.75 });
    expect(acceptProposal()).toBe('stale');
    expect(current(UPS.id)).toEqual(UPS);
    expect(state().history.past).toHaveLength(1);
    expect(state().proposal).toBe(PROPOSAL);
    expect(notices()).toEqual([
      {
        tone: 'info',
        text: 'The layout changed since this proposal was made. Ask again for a fresh one.',
      },
    ]);
  });

  test('a proposal goes stale when one of its items is deleted', () => {
    showProposal(PROPOSAL);
    removeItem(UPS.id);
    expect(acceptProposal()).toBe('stale');
    expect(tags()).toEqual(['CAB-01', 'VFD-01']);
  });

  test('a proposal that breaks the layout rules is rejected with an error notice', () => {
    const [first] = PROPOSAL.moves;
    showProposal({
      ...PROPOSAL,
      moves: [{ ...required(first), to: { x: 30, z: 2.5, rotation: 0 } }],
    });
    expect(acceptProposal()).toBe('rejected');
    expect(state().items).toBe(LAYOUT);
    expect(state().history.past).toEqual([]);
    expect(notices()).toEqual([{ tone: 'error', text: 'UPS-01 has to stay inside the room.' }]);
  });

  test('accepting without a proposal reports it missing; rejecting clears the preview', () => {
    expect(acceptProposal()).toBe('missing');
    showProposal(PROPOSAL);
    rejectProposal();
    expect(state().proposal).toBeNull();
    expect(state().items).toBe(LAYOUT);
  });
});

describe('undo and redo', () => {
  const EDITS: readonly (readonly [string, () => void])[] = [
    [
      'Add CAB-02',
      () => {
        addItem('cabinet', { x: 10, z: 8 });
      },
    ],
    [
      'Delete VFD-01',
      () => {
        removeItem(VFD.id);
      },
    ],
    [
      'Move CAB-01',
      () => {
        moveItem(CAB.id, { x: 8, z: 8 });
      },
    ],
    [
      'Rotate CAB-01',
      () => {
        setItemRotation(CAB.id, 270);
      },
    ],
    [
      'Rename MAIN-01',
      () => {
        renameItem(CAB.id, 'MAIN-01');
      },
    ],
    [
      'Duplicate CAB-02',
      () => {
        select(CAB.id);
        duplicateSelection();
      },
    ],
    [
      'Paste UPS-02',
      () => {
        select(UPS.id);
        copySelection();
        pasteClipboard({ x: 10, z: 8 });
      },
    ],
    [
      'Clear layout',
      () => {
        clearLayout();
      },
    ],
    [
      'Assistant change (2 moves)',
      () => {
        showProposal(PROPOSAL);
        acceptProposal();
      },
    ],
    [
      'Move VFD-01',
      () => {
        beginDrag(VFD.id);
        updateDrag({ x: 9, z: 9 });
        endDrag();
      },
    ],
  ];

  test.each(EDITS)('"%s" is one step that undo reverts and redo repeats', (label, edit) => {
    edit();
    const after = state().items;
    expect(after).not.toEqual(LAYOUT);
    expect(state().history.past).toHaveLength(1);
    undo();
    expect(state().items).toEqual(LAYOUT);
    expect(announced()).toBe(`Undone: ${label}.`);
    redo();
    expect(state().items).toEqual(after);
    expect(announced()).toBe(`Redone: ${label}.`);
  });

  test('undo and redo restore the selection that went with each step', () => {
    select(VFD.id);
    const added = required(addItem('ups', { x: 10, z: 8 }));
    expect(state().selectedId).toBe(added);
    undo();
    expect(state().selectedId).toBe(VFD.id);
    redo();
    expect(state().selectedId).toBe(added);
  });

  test('a selection that no longer exists is not restored', () => {
    select(CAB.id);
    const added = required(addItem('ups', { x: 10, z: 8 }));
    useEditor.setState({ items: state().items.filter((item) => item.id !== CAB.id) });
    undo();
    expect(state().items.map((item) => item.id)).not.toContain(added);
    expect(state().selectedId).toBeNull();
  });

  test('says when there is nothing to undo or redo', () => {
    undo();
    expect(announced()).toBe('Nothing to undo.');
    redo();
    expect(announced()).toBe('Nothing to redo.');
    expect(state().items).toBe(LAYOUT);
  });

  test('a new edit after undo discards the redo stack', () => {
    moveItem(CAB.id, { x: 8, z: 8 });
    undo();
    moveItem(UPS.id, { x: 15, z: 8 });
    expect(state().history.future).toEqual([]);
    redo();
    expect(announced()).toBe('Nothing to redo.');
  });

  test('keeps the last 200 edits', () => {
    select(VFD.id);
    for (let step = 0; step < 101; step++) {
      nudgeSelection(1, 0);
      nudgeSelection(-1, 0);
    }
    expect(state().history.past).toHaveLength(200);
  });

  test('when the layout changed behind the history, undo resets it and says so', () => {
    moveItem(UPS.id, { x: 15, z: 8 });
    useEditor.setState({ items: [CAB, VFD] });
    undo();
    expect(state().history).toEqual({ past: [], future: [] });
    expect(state().items).toEqual([CAB, VFD]);
    expect(notices()).toEqual([
      { tone: 'error', text: 'Undo history was reset because it no longer matched the layout.' },
    ]);
  });
});

describe('notices and announcements', () => {
  test('notify sends errors to the alert toaster for 7 s and other notices to the main one for 4 s', () => {
    notify('info', 'Saved');
    notify('success', 'Applied');
    notify('error', 'Broken');
    expect(notices()).toEqual([
      { tone: 'info', text: 'Saved' },
      { tone: 'success', text: 'Applied' },
      { tone: 'error', text: 'Broken' },
    ]);
    expect(
      toast
        .getToasts()
        .map((shown) => ('dismiss' in shown ? null : [shown.toasterId, shown.duration])),
    ).toEqual([
      [undefined, 4000],
      [undefined, 4000],
      [ALERT_TOASTER_ID, 7000],
    ]);
  });

  test('reportEditError shows the localised message as an error', () => {
    reportEditError({ code: 'out-of-bounds', id: CAB.id });
    expect(notices()).toEqual([{ tone: 'error', text: 'CAB-01 has to stay inside the room.' }]);
  });

  test('every announcement gets a new id, even when the text repeats', () => {
    announce('Same');
    const firstId = required(state().announcement).id;
    announce('Same');
    expect(state().announcement?.text).toBe('Same');
    expect(required(state().announcement).id).toBeGreaterThan(firstId);
  });
});

describe('UI state', () => {
  test('setLocale switches the language of later messages and remembers the choice', () => {
    setLocale('vi');
    expect(state().locale).toBe('vi');
    expect(loadLocalePreference()).toBe('vi');
    moveItem(CAB.id, { x: 6, z: 4.75 });
    expect(announced()).toBe('CAB-01 đã di chuyển đến X 6,00 m, Z 4,75 m.');
  });

  test('setInspectorTab and toggleStats', () => {
    setInspectorTab('assistant');
    toggleStats();
    expect(state()).toMatchObject({ inspectorTab: 'assistant', showStats: true });
    toggleStats();
    expect(state().showStats).toBe(false);
  });

  test('camera requests bump the sequence so the viewport can react', () => {
    setCameraView('top');
    expect(state().camera).toEqual({ view: 'top', seq: 1, focusId: null, zoom: null, turn: null });
    focusItem(CAB.id);
    expect(state().camera).toEqual({
      view: 'top',
      seq: 2,
      focusId: CAB.id,
      zoom: null,
      turn: null,
    });
    setCameraView('perspective');
    expect(state().camera).toEqual({
      view: 'perspective',
      seq: 3,
      focusId: null,
      zoom: null,
      turn: null,
    });
    focusSelection();
    expect(state().camera.seq).toBe(3);
    select(UPS.id);
    focusSelection();
    expect(state().camera).toEqual({
      view: 'perspective',
      seq: 4,
      focusId: UPS.id,
      zoom: null,
      turn: null,
    });
  });

  test('zoom and turn requests keep the view and focus, and the next preset or focus clears them', () => {
    focusItem(CAB.id);
    zoomCamera('in');
    expect(state().camera).toEqual({
      view: 'perspective',
      seq: 2,
      focusId: CAB.id,
      zoom: 'in',
      turn: null,
    });
    turnCamera(-1);
    expect(state().camera).toEqual({
      view: 'perspective',
      seq: 3,
      focusId: CAB.id,
      zoom: null,
      turn: -1,
    });
    zoomCamera('out');
    expect(state().camera).toMatchObject({ seq: 4, zoom: 'out', turn: null });
    focusItem(UPS.id);
    expect(state().camera).toMatchObject({ seq: 5, focusId: UPS.id, zoom: null });
    turnCamera(1);
    setCameraView('top');
    expect(state().camera).toEqual({ view: 'top', seq: 7, focusId: null, zoom: null, turn: null });
  });

  test('replaceLayout loads items without history and resets the editing state', () => {
    moveItem(CAB.id, { x: 6, z: 4.75 });
    hover(CAB.id);
    showProposal(PROPOSAL);
    startPlacement('drive');
    replaceLayout([UPS]);
    expect(state()).toMatchObject({
      items: [UPS],
      history: { past: [], future: [] },
      selectedId: null,
      hoveredId: null,
      drag: null,
      ghost: null,
      proposal: null,
      tool: { type: 'select' },
    });
  });
});
