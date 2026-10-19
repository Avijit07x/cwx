import { applyOps, type EditError, type Op } from './ops';
import type { ItemId, PlacedItem } from './types';

export type EditAction =
  'add' | 'remove' | 'move' | 'rotate' | 'rename' | 'duplicate' | 'paste' | 'clear' | 'assistant';

export type EditLabel =
  | { readonly action: 'clear' | 'assistant'; readonly count: number }
  | { readonly action: Exclude<EditAction, 'clear' | 'assistant'>; readonly subject: string };

export interface Transaction {
  readonly label: EditLabel;
  readonly ops: readonly Op[];
  readonly inverse: readonly Op[];
  readonly selectionBefore: ItemId | null;
  readonly selectionAfter: ItemId | null;
}

export interface History {
  readonly past: readonly Transaction[];
  readonly future: readonly Transaction[];
}

export interface DocState {
  readonly items: readonly PlacedItem[];
  readonly history: History;
}

export const HISTORY_LIMIT = 200;

export const EMPTY_HISTORY: History = { past: [], future: [] };

export type CommitOutcome =
  | { readonly status: 'applied'; readonly state: DocState; readonly tx: Transaction }
  | { readonly status: 'unchanged' }
  | { readonly status: 'rejected'; readonly error: EditError };

export type StepOutcome =
  | { readonly status: 'applied'; readonly state: DocState; readonly tx: Transaction }
  | { readonly status: 'empty' }
  | { readonly status: 'conflict'; readonly state: DocState };

interface SelectionChange {
  readonly before: ItemId | null;
  readonly after: ItemId | null;
}

export function commit(
  state: DocState,
  label: EditLabel,
  ops: readonly Op[],
  selection: SelectionChange,
  limit = HISTORY_LIMIT,
): CommitOutcome {
  const result = applyOps(state.items, ops);
  if (!result.ok) return { status: 'rejected', error: result.error };
  if (result.items === state.items) return { status: 'unchanged' };
  const tx: Transaction = {
    label,
    ops,
    inverse: result.inverse,
    selectionBefore: selection.before,
    selectionAfter: selection.after,
  };
  const past = [...state.history.past, tx].slice(-limit);
  return {
    status: 'applied',
    tx,
    state: { items: result.items, history: { past, future: [] } },
  };
}

function conflict(state: DocState): StepOutcome {
  return { status: 'conflict', state: { ...state, history: EMPTY_HISTORY } };
}

export function undo(state: DocState): StepOutcome {
  const tx = state.history.past.at(-1);
  if (!tx) return { status: 'empty' };
  const result = applyOps(state.items, tx.inverse);
  if (!result.ok) return conflict(state);
  return {
    status: 'applied',
    tx,
    state: {
      items: result.items,
      history: { past: state.history.past.slice(0, -1), future: [...state.history.future, tx] },
    },
  };
}

export function redo(state: DocState): StepOutcome {
  const tx = state.history.future.at(-1);
  if (!tx) return { status: 'empty' };
  const result = applyOps(state.items, tx.ops);
  if (!result.ok) return conflict(state);
  return {
    status: 'applied',
    tx,
    state: {
      items: result.items,
      history: { past: [...state.history.past, tx], future: state.history.future.slice(0, -1) },
    },
  };
}
