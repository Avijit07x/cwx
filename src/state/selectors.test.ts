import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { proposeClearanceFix } from '../domain/proposeFix';
import { sampleLayout } from '../domain/seed';
import { toItemId, type PlacedItem } from '../domain/types';
import {
  addItem,
  beginDrag,
  cancelDrag,
  hover,
  moveItem,
  renameItem,
  select,
  setLocale,
  showProposal,
  undo,
  updateDrag,
} from './actions';
import {
  selectBom,
  selectCommittedViolations,
  selectEffectiveIndex,
  selectEffectiveItems,
  selectEffectiveItemsOfKind,
  selectItemIndex,
  selectNextRedo,
  selectNextUndo,
  selectProposalStale,
  selectProposalViolations,
  selectSelectedItem,
  selectTagOf,
  selectViolatingIds,
  selectViolations,
  useBom,
  useSelectedItem,
  useTagOf,
  useViolatingIds,
  useViolations,
} from './selectors';
import { createInitialState, resetEditor, useEditor } from './store';

const state = () => useEditor.getState();

function byTag(tag: string): PlacedItem {
  const item = state().items.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No ${tag} in the layout`);
  return item;
}

beforeEach(() => {
  resetEditor(sampleLayout());
  window.localStorage.clear();
});

describe('store', () => {
  test('derived data follows the committed items alone, so nothing else in the store has to be kept in step', () => {
    useEditor.setState({ items: [byTag('TR-01'), byTag('UPS-01')] });
    expect(selectViolations(state())).toHaveLength(1);
    expect(selectBom(state()).totalQuantity).toBe(2);
    useEditor.setState({ items: [] });
    expect(selectViolations(state())).toEqual([]);
    expect(selectViolatingIds(state()).size).toBe(0);
    expect(selectBom(state()).totalQuantity).toBe(0);
    expect(selectItemIndex(state()).size).toBe(0);
  });

  test('resetEditor replaces the whole state and loads the given items', () => {
    select(byTag('CAB-01').id);
    moveItem(byTag('CAB-01').id, { x: 12, z: 8 });
    setLocale('vi');
    const items = sampleLayout().slice(0, 3);
    resetEditor(items);
    expect(state()).toEqual(createInitialState(items));
  });
});

describe('memoised selectors', () => {
  test('return the same object until their inputs change', () => {
    const before = {
      items: selectEffectiveItems(state()),
      violations: selectViolations(state()),
      ids: selectViolatingIds(state()),
      bom: selectBom(state()),
      index: selectItemIndex(state()),
      cabinets: selectEffectiveItemsOfKind(state(), 'cabinet'),
    };
    hover(byTag('CAB-02').id);
    select(byTag('CAB-03').id);
    setLocale('vi');
    expect(selectEffectiveItems(state())).toBe(before.items);
    expect(selectViolations(state())).toBe(before.violations);
    expect(selectViolatingIds(state())).toBe(before.ids);
    expect(selectBom(state())).toBe(before.bom);
    expect(selectItemIndex(state())).toBe(before.index);
    expect(selectEffectiveItemsOfKind(state(), 'cabinet')).toBe(before.cabinets);

    moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    expect(selectEffectiveItems(state())).not.toBe(before.items);
    expect(selectViolations(state())).toEqual([]);
  });

  test('violations and ids are derived from the layout', () => {
    const tr = byTag('TR-01');
    const ups = byTag('UPS-01');
    expect(selectViolations(state()).map((violation) => [violation.a, violation.b])).toEqual([
      [tr.id, ups.id],
    ]);
    expect(selectViolatingIds(state())).toEqual(new Set([tr.id, ups.id]));
  });

  test('effective items, violations and per-kind lists follow a drag preview live', () => {
    const vfd = byTag('VFD-01');
    beginDrag(vfd.id);
    updateDrag({ x: 4.3, z: 3.75 });
    expect(selectEffectiveIndex(state()).get(vfd.id)).toMatchObject({ x: 4.25, z: 3.75 });
    expect(selectItemIndex(state()).get(vfd.id)).toBe(vfd);
    expect(selectEffectiveItemsOfKind(state(), 'drive').find((item) => item.id === vfd.id)?.x).toBe(
      4.25,
    );
    expect(selectViolatingIds(state()).has(vfd.id)).toBe(true);
    expect(selectViolatingIds(state()).has(byTag('VFD-02').id)).toBe(true);
    expect(selectEffectiveItems(state())).not.toBe(state().items);
  });

  test('selectSelectedItem returns the selected item where it is drawn, following a drag, or null', () => {
    expect(selectSelectedItem(state())).toBeNull();
    const ups = byTag('UPS-02');
    select(ups.id);
    expect(selectSelectedItem(state())).toBe(ups);
    beginDrag(ups.id);
    updateDrag({ x: 13.5, z: 9.5 });
    expect(selectSelectedItem(state())).toMatchObject({ id: ups.id, x: 13.5, z: 9.5 });
  });

  test('selectTagOf looks tags up by id, stays the same during a drag and follows a rename', () => {
    const vfd = byTag('VFD-01');
    const tagOf = selectTagOf(state());
    expect(tagOf(vfd.id)).toBe('VFD-01');
    expect(tagOf(toItemId('missing'))).toBe('');
    beginDrag(vfd.id);
    updateDrag({ x: 9.25, z: 6.25 });
    expect(selectTagOf(state())).toBe(tagOf);
    cancelDrag();
    renameItem(vfd.id, 'VFD-99');
    expect(selectTagOf(state())(vfd.id)).toBe('VFD-99');
  });

  test('a drag step keeps every derived list it does not change', () => {
    const ups = byTag('UPS-02');
    beginDrag(ups.id);
    updateDrag({ x: 13, z: 9.5 });
    const before = {
      violations: selectViolations(state()),
      ids: selectViolatingIds(state()),
      cabinets: selectEffectiveItemsOfKind(state(), 'cabinet'),
      units: selectEffectiveItemsOfKind(state(), 'ups'),
    };
    updateDrag({ x: 13.5, z: 9.5 });
    expect(selectViolations(state())).toBe(before.violations);
    expect(selectViolatingIds(state())).toBe(before.ids);
    expect(selectEffectiveItemsOfKind(state(), 'cabinet')).toBe(before.cabinets);
    expect(selectEffectiveItemsOfKind(state(), 'ups')).not.toBe(before.units);
  });

  test('the violating items are kept while only the gaps between them change', () => {
    const ups = byTag('UPS-01');
    beginDrag(ups.id);
    const violations = selectViolations(state());
    const ids = selectViolatingIds(state());
    updateDrag({ x: 17, z: 2.5 });
    expect(selectViolations(state())).not.toEqual(violations);
    expect(selectViolatingIds(state())).toBe(ids);
  });

  test('selectBom counts the committed layout', () => {
    expect(selectBom(state()).totalQuantity).toBe(12);
    addItem('ups', { x: 10, z: 6 });
    expect(selectBom(state()).lines.find((line) => line.kind === 'ups')?.quantity).toBe(3);
    expect(selectBom(state()).totalQuantity).toBe(13);
  });

  test('the next undo and redo steps', () => {
    expect(selectNextUndo(state())).toBeNull();
    moveItem(byTag('CAB-01').id, { x: 12, z: 8 });
    expect(selectNextUndo(state())?.label).toEqual({ action: 'move', subject: 'CAB-01' });
    expect(selectNextRedo(state())).toBeNull();
    undo();
    expect(selectNextUndo(state())).toBeNull();
    expect(selectNextRedo(state())?.label).toEqual({ action: 'move', subject: 'CAB-01' });
  });
});

describe('committed and proposal selectors', () => {
  test('committed violations ignore a drag preview', () => {
    const committed = selectCommittedViolations(state());
    expect(committed.map((violation) => violation.b)).toEqual([byTag('UPS-01').id]);
    beginDrag(byTag('VFD-01').id);
    updateDrag({ x: 4.3, z: 3.75 });
    expect(selectViolations(state())).not.toEqual(committed);
    expect(selectCommittedViolations(state())).toBe(committed);
  });

  test('the previewed proposal’s violations and staleness follow the committed layout', () => {
    expect(selectProposalViolations(state())).toBeNull();
    expect(selectProposalStale(state())).toBe(false);
    showProposal(proposeClearanceFix(state().items));
    const violations = selectProposalViolations(state());
    expect(violations).toEqual([]);
    hover(byTag('CAB-01').id);
    expect(selectProposalViolations(state())).toBe(violations);

    moveItem(byTag('CAB-01').id, { x: 4, z: 1.25 });
    expect(selectProposalViolations(state())).toHaveLength(1);
    expect(selectProposalStale(state())).toBe(false);
    addItem('drive', { x: 18, z: 2.5 });
    expect(selectProposalStale(state())).toBe(true);
  });
});

describe('selector hooks', () => {
  test('keep their results stable across unrelated updates and follow layout changes', () => {
    const { result } = renderHook(() => ({
      violations: useViolations(),
      ids: useViolatingIds(),
      bom: useBom(),
      selected: useSelectedItem(),
      tagOf: useTagOf(),
    }));
    const first = result.current;
    expect(first.violations).toHaveLength(1);

    act(() => {
      hover(byTag('CAB-01').id);
    });
    expect(result.current.violations).toBe(first.violations);
    expect(result.current.bom).toBe(first.bom);
    expect(result.current.tagOf).toBe(first.tagOf);

    act(() => {
      moveItem(byTag('UPS-01').id, { x: 18, z: 2.5 });
    });
    expect(result.current.violations).toEqual([]);
    expect(result.current.ids.size).toBe(0);

    act(() => {
      select(byTag('UPS-01').id);
    });
    expect(result.current.selected?.tag).toBe('UPS-01');
  });
});
