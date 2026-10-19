import { describe, expect, expectTypeOf, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import {
  commit,
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  redo,
  undo,
  type CommitOutcome,
  type DocState,
  type EditLabel,
  type StepOutcome,
} from './history';
import type { Op } from './ops';
import type { PlacedItem } from './types';

const DRIVE = makeItem({ kind: 'drive', tag: 'VFD-01', x: 0.25, z: 0.25 });
const CAB = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const MOVE: EditLabel = { action: 'move', subject: 'VFD-01' };
const NO_SELECTION = { before: null, after: null };

function doc(items: readonly PlacedItem[]): DocState {
  return { items, history: EMPTY_HISTORY };
}

function moveDrive(x: number): Op {
  return { type: 'update', id: DRIVE.id, changes: { x } };
}

function committed(outcome: CommitOutcome): DocState {
  if (outcome.status !== 'applied') throw new Error(`Expected a commit, got ${outcome.status}`);
  return outcome.state;
}

function stepped(outcome: StepOutcome): DocState {
  if (outcome.status !== 'applied') throw new Error(`Expected a step, got ${outcome.status}`);
  return outcome.state;
}

describe('edit labels', () => {
  test('name a subject, or a count for clear and assistant, so no label reads "Move " or "0 moves"', () => {
    expectTypeOf<{ action: 'move' }>().not.toExtend<EditLabel>();
    expectTypeOf<{ action: 'assistant' }>().not.toExtend<EditLabel>();
    expectTypeOf<{ action: 'move'; count: number }>().not.toExtend<EditLabel>();
    expectTypeOf<{ action: 'move'; subject: string }>().toExtend<EditLabel>();
    expectTypeOf<{ action: 'assistant'; count: number }>().toExtend<EditLabel>();
  });
});

describe('commit', () => {
  test('applies the ops and records one transaction with its inverse', () => {
    const outcome = commit(doc([DRIVE]), MOVE, [moveDrive(1.25)], {
      before: null,
      after: DRIVE.id,
    });
    if (outcome.status !== 'applied') throw new Error('Expected the commit to apply');
    expect(outcome.state).toEqual({
      items: [{ ...DRIVE, x: 1.25 }],
      history: { past: [outcome.tx], future: [] },
    });
    expect(outcome.tx).toEqual({
      label: MOVE,
      ops: [moveDrive(1.25)],
      inverse: [moveDrive(0.25)],
      selectionBefore: null,
      selectionAfter: DRIVE.id,
    });
  });

  test('a new commit clears the redo stack', () => {
    let state = committed(commit(doc([DRIVE]), MOVE, [moveDrive(1.25)], NO_SELECTION));
    state = stepped(undo(state));
    expect(state.history.future).toHaveLength(1);
    state = committed(commit(state, MOVE, [moveDrive(2.25)], NO_SELECTION));
    expect(state.history.future).toEqual([]);
    expect(redo(state)).toEqual({ status: 'empty' });
  });

  test('a rejected commit returns the error and records nothing', () => {
    expect(commit(doc([DRIVE]), MOVE, [moveDrive(30)], NO_SELECTION)).toEqual({
      status: 'rejected',
      error: { code: 'out-of-bounds', id: DRIVE.id },
    });
  });

  test('an edit that changes nothing is not recorded', () => {
    expect(commit(doc([DRIVE]), MOVE, [moveDrive(0.25)], NO_SELECTION)).toEqual({
      status: 'unchanged',
    });
    expect(commit(doc([DRIVE]), MOVE, [], NO_SELECTION)).toEqual({ status: 'unchanged' });
  });
});

describe('history limit', () => {
  test('keeps the most recent 200 transactions and drops the oldest', () => {
    expect(HISTORY_LIMIT).toBe(200);
    let state = doc([DRIVE]);
    for (let step = 1; step <= 205; step++) {
      const label: EditLabel = { action: 'move', subject: String(step) };
      state = committed(
        commit(state, label, [moveDrive(step % 2 === 1 ? 1.25 : 0.25)], NO_SELECTION),
      );
    }
    expect(state.history.past).toHaveLength(200);
    expect(state.history.past[0]?.label).toEqual({ action: 'move', subject: '6' });
    expect(state.history.past.at(-1)?.label).toEqual({ action: 'move', subject: '205' });

    for (let step = 0; step < 200; step++) state = stepped(undo(state));
    expect(undo(state)).toEqual({ status: 'empty' });
    expect(state.items).toEqual([{ ...DRIVE, x: 1.25 }]);
  });

  test('honours a custom limit', () => {
    let state = doc([DRIVE]);
    for (const x of [1.25, 2.25, 3.25, 4.25]) {
      state = committed(commit(state, MOVE, [moveDrive(x)], NO_SELECTION, 3));
    }
    expect(state.history.past.map((tx) => tx.ops)).toEqual([
      [moveDrive(2.25)],
      [moveDrive(3.25)],
      [moveDrive(4.25)],
    ]);
  });
});

describe('undo and redo', () => {
  test('undo applies the inverse and moves the transaction to the redo stack', () => {
    const edited = committed(commit(doc([DRIVE]), MOVE, [moveDrive(1.25)], NO_SELECTION));
    const outcome = undo(edited);
    if (outcome.status !== 'applied') throw new Error('Expected the undo to apply');
    expect(outcome.state).toEqual({ items: [DRIVE], history: { past: [], future: [outcome.tx] } });
    expect(outcome.tx).toBe(edited.history.past[0]);
  });

  test('redo re-applies the transaction', () => {
    const edited = committed(commit(doc([DRIVE]), MOVE, [moveDrive(1.25)], NO_SELECTION));
    const outcome = redo(stepped(undo(edited)));
    if (outcome.status !== 'applied') throw new Error('Expected the redo to apply');
    expect(outcome.state).toEqual({
      items: edited.items,
      history: { past: [outcome.tx], future: [] },
    });
  });

  test('report empty stacks', () => {
    expect(undo(doc([DRIVE]))).toEqual({ status: 'empty' });
    expect(redo(doc([DRIVE]))).toEqual({ status: 'empty' });
  });

  test('walking back through a mixed history and forward again reproduces every state', () => {
    const edits: readonly { readonly label: EditLabel; readonly ops: readonly Op[] }[] = [
      { label: { action: 'add', subject: 'CAB-01' }, ops: [{ type: 'add', item: CAB, index: 1 }] },
      {
        label: { action: 'move', subject: 'CAB-01' },
        ops: [{ type: 'update', id: CAB.id, changes: { x: 5, z: 2.25 } }],
      },
      {
        label: { action: 'rotate', subject: 'CAB-01' },
        ops: [{ type: 'update', id: CAB.id, changes: { rotation: 90, x: 4.75, z: 2 } }],
      },
      {
        label: { action: 'rename', subject: 'MAIN-01' },
        ops: [{ type: 'update', id: CAB.id, changes: { tag: 'MAIN-01' } }],
      },
      {
        label: { action: 'clear', count: 2 },
        ops: [
          { type: 'remove', id: DRIVE.id },
          { type: 'remove', id: CAB.id },
        ],
      },
    ];
    let state = doc([DRIVE]);
    const snapshots: (readonly PlacedItem[])[] = [state.items];
    for (const edit of edits) {
      state = committed(commit(state, edit.label, edit.ops, NO_SELECTION));
      snapshots.push(state.items);
    }
    expect(state.items).toEqual([]);

    for (let index = edits.length - 1; index >= 0; index--) {
      state = stepped(undo(state));
      expect(state.items).toEqual(snapshots[index]);
    }
    expect(state.history.future.map((tx) => tx.label.action)).toEqual([
      'clear',
      'rename',
      'rotate',
      'move',
      'add',
    ]);

    for (let index = 1; index <= edits.length; index++) {
      state = stepped(redo(state));
      expect(state.items).toEqual(snapshots[index]);
    }
  });

  test('an undo that no longer fits the layout reports a conflict and resets the history', () => {
    const removed = committed(
      commit(
        doc([DRIVE]),
        { action: 'remove', subject: 'VFD-01' },
        [{ type: 'remove', id: DRIVE.id }],
        NO_SELECTION,
      ),
    );
    const changedElsewhere: DocState = { ...removed, items: [DRIVE] };
    expect(undo(changedElsewhere)).toEqual({
      status: 'conflict',
      state: { ...changedElsewhere, history: EMPTY_HISTORY },
    });
  });

  test('a redo that no longer fits the layout reports a conflict and resets the history', () => {
    const removed = committed(
      commit(
        doc([DRIVE]),
        { action: 'remove', subject: 'VFD-01' },
        [{ type: 'remove', id: DRIVE.id }],
        NO_SELECTION,
      ),
    );
    const changedElsewhere: DocState = { ...stepped(undo(removed)), items: [] };
    expect(redo(changedElsewhere)).toEqual({
      status: 'conflict',
      state: { ...changedElsewhere, history: EMPTY_HISTORY },
    });
  });
});
