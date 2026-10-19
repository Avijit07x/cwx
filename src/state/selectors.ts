import { deriveBom } from '../domain/bom';
import { applyProposal, isProposalStale, type Proposal } from '../domain/proposal';
import { findViolations, violatingIds, type Violation } from '../domain/rules';
import type { ItemId, ItemKind, PlacedItem } from '../domain/types';
import type { TagLookup } from '../i18n/describe';
import { memoizeLast } from './memo';
import { useEditor, type DragPreview, type EditorState } from './store';

export type ItemIndex = ReadonlyMap<ItemId, PlacedItem>;

function sameList<T>(
  previous: readonly T[],
  next: readonly T[],
  same: (a: T, b: T) => boolean = (a, b) => a === b,
): boolean {
  return (
    previous.length === next.length &&
    previous.every((value, index) => {
      const other = next[index];
      return other !== undefined && same(value, other);
    })
  );
}

function sameViolation(a: Violation, b: Violation): boolean {
  return a.a === b.a && a.b === b.b && a.gap === b.gap && a.overlap === b.overlap;
}

function sameMembers<T>(previous: ReadonlySet<T>, next: ReadonlySet<T>): boolean {
  return previous.size === next.size && [...previous].every((value) => next.has(value));
}

const withDrag = memoizeLast(
  (items: readonly PlacedItem[], drag: DragPreview | null): readonly PlacedItem[] =>
    drag
      ? items.map((item) =>
          item.id === drag.id ? { ...item, x: drag.x, z: drag.z, rotation: drag.rotation } : item,
        )
      : items,
);

export const selectEffectiveItems = (state: EditorState) => withDrag(state.items, state.drag);

const violationsOf = memoizeLast(
  (items: readonly PlacedItem[]): readonly Violation[] => findViolations(items),
  (previous, next) => sameList(previous, next, sameViolation),
);
export const selectViolations = (state: EditorState) => violationsOf(selectEffectiveItems(state));

const violatingIdsOf = memoizeLast(violatingIds, sameMembers);
export const selectViolatingIds = (state: EditorState) => violatingIdsOf(selectViolations(state));

const committedViolationsOf = memoizeLast(findViolations);
export const selectCommittedViolations = (state: EditorState) => committedViolationsOf(state.items);

const proposalViolationsOf = memoizeLast((items: readonly PlacedItem[], proposal: Proposal) =>
  findViolations(applyProposal(items, proposal)),
);
export const selectProposalViolations = (state: EditorState): readonly Violation[] | null =>
  state.proposal && proposalViolationsOf(state.items, state.proposal);

const proposalStaleOf = memoizeLast((items: readonly PlacedItem[], proposal: Proposal) =>
  isProposalStale(proposal, items),
);
export const selectProposalStale = (state: EditorState): boolean =>
  state.proposal !== null && proposalStaleOf(state.items, state.proposal);

function byId(items: readonly PlacedItem[]): ItemIndex {
  return new Map(items.map((item) => [item.id, item]));
}

const indexOf = memoizeLast(byId);
export const selectItemIndex = (state: EditorState) => indexOf(state.items);

const effectiveIndexOf = memoizeLast(byId);
export const selectEffectiveIndex = (state: EditorState) =>
  effectiveIndexOf(selectEffectiveItems(state));

export const selectSelectedItem = (state: EditorState): PlacedItem | null =>
  state.selectedId ? (selectEffectiveIndex(state).get(state.selectedId) ?? null) : null;

function tagLookup(index: ItemIndex): TagLookup {
  return (id) => index.get(id)?.tag ?? '';
}

const tagLookupOf = memoizeLast(tagLookup);
export const selectTagOf = (state: EditorState) => tagLookupOf(selectItemIndex(state));

const bomOf = memoizeLast(deriveBom);
export const selectBom = (state: EditorState) => bomOf(state.items);

function kindFilter(kind: ItemKind) {
  return memoizeLast(
    (items: readonly PlacedItem[]): readonly PlacedItem[] =>
      items.filter((item) => item.kind === kind),
    sameList,
  );
}

const kindFilters: Readonly<
  Record<ItemKind, (items: readonly PlacedItem[]) => readonly PlacedItem[]>
> = {
  cabinet: kindFilter('cabinet'),
  drive: kindFilter('drive'),
  transformer: kindFilter('transformer'),
  ups: kindFilter('ups'),
};

export const selectEffectiveItemsOfKind = (state: EditorState, kind: ItemKind) =>
  kindFilters[kind](selectEffectiveItems(state));

export const selectNextUndo = (state: EditorState) => state.history.past.at(-1) ?? null;
export const selectNextRedo = (state: EditorState) => state.history.future.at(-1) ?? null;

export const useViolations = () => useEditor(selectViolations);
export const useViolatingIds = () => useEditor(selectViolatingIds);
export const useSelectedItem = () => useEditor(selectSelectedItem);
export const useTagOf = () => useEditor(selectTagOf);
export const useBom = () => useEditor(selectBom);
