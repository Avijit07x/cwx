import { toast } from 'sonner';
import { centreAfterRotation, FLOOR, snapToGrid } from '../domain/grid';
import {
  commit,
  redo as redoDoc,
  undo as undoDoc,
  type CommitOutcome,
  type EditLabel,
} from '../domain/history';
import { nextTag } from '../domain/naming';
import { normalizeTag, type EditError, type ItemChanges, type Op } from '../domain/ops';
import { findFreeSpot } from '../domain/placement';
import { proposalOps, type Proposal } from '../domain/proposal';
import { otherItem, violationsInvolving } from '../domain/rules';
import {
  newItemId,
  turn,
  type ItemId,
  type ItemKind,
  type PlacedItem,
  type Point,
  type Rotation,
} from '../domain/types';
import { describeEdit, describeEditError } from '../i18n/describe';
import type { Locale } from '../i18n/locales';
import { getTranslator, type Translator } from '../i18n/translate';
import { COPY_SHORTCUT, PASTE_SHORTCUT, UNDO_SHORTCUT } from '../platform';
import { saveLocalePreference } from './persistence';
import { selectItemIndex, selectProposalStale, selectTagOf, selectViolations } from './selectors';
import {
  useEditor,
  type CameraView,
  type EditorState,
  type InspectorTab,
  type TurnDirection,
  type ZoomDirection,
} from './store';

const get = useEditor.getState;
const set = useEditor.setState;

const ROOM_CENTRE: Point = { x: FLOOR.width / 2, z: FLOOR.depth / 2 };

export function tr(): Translator {
  return getTranslator(get().locale);
}

function itemById(id: ItemId | null): PlacedItem | undefined {
  return id === null ? undefined : selectItemIndex(get()).get(id);
}

function positionParams(t: Translator, point: Point) {
  return { x: t.metres(point.x), z: t.metres(point.z) };
}

function clearanceNote(id: ItemId): string {
  const state = get();
  const violations = violationsInvolving(id, selectViolations(state));
  if (violations.length === 0) return '';
  const t = tr();
  const tagOf = selectTagOf(state);
  const others = t.list(violations.map((violation) => tagOf(otherItem(violation, id))));
  return ` ${t.t('rule.tooCloseTo', { others })}`;
}

let announcementSeq = 0;

export function announce(text: string): void {
  announcementSeq += 1;
  set({ announcement: { id: announcementSeq, text } });
}

type NoticeTone = 'info' | 'success' | 'error';

export const ALERT_TOASTER_ID = 'alerts';

const NOTICE_DURATION_MS: Readonly<Record<NoticeTone, number>> = {
  info: 4000,
  success: 4000,
  error: 7000,
};

export function notify(tone: NoticeTone, text: string): void {
  const duration = NOTICE_DURATION_MS[tone];
  if (tone === 'error') toast.error(text, { duration, toasterId: ALERT_TOASTER_ID });
  else toast[tone](text, { duration });
}

export function reportEditError(error: EditError): void {
  notify('error', describeEditError(tr(), error, selectTagOf(get())));
}

function commitEdit(
  label: EditLabel,
  ops: readonly Op[],
  selectionAfter: ItemId | null,
  extra: Partial<Pick<EditorState, 'hoveredId' | 'drag' | 'proposal'>> = {},
): CommitOutcome {
  const state = get();
  const outcome = commit(state, label, ops, { before: state.selectedId, after: selectionAfter });
  if (outcome.status === 'applied') set({ ...extra, ...outcome.state, selectedId: selectionAfter });
  else if (Object.keys(extra).length > 0) set(extra);
  return outcome;
}

function commitNewItem(
  action: 'add' | 'duplicate' | 'paste',
  kind: ItemKind,
  rotation: Rotation,
  at: Point,
): PlacedItem | null {
  const { items } = get();
  const item: PlacedItem = { id: newItemId(), kind, rotation, tag: nextTag(kind, items), ...at };
  const outcome = commitEdit(
    { action, subject: item.tag },
    [{ type: 'add', item, index: items.length }],
    item.id,
  );
  if (outcome.status === 'rejected') reportEditError(outcome.error);
  return outcome.status === 'applied' ? item : null;
}

function freeSpot(kind: ItemKind, rotation: Rotation, near: Point): Point | null {
  const spot = findFreeSpot(kind, rotation, get().items, near);
  if (!spot) {
    const t = tr();
    notify('info', t.t('announce.noSpace', { kind: t.kindName(kind) }));
  }
  return spot;
}

export function addItem(kind: ItemKind, at: Point, rotation: Rotation = 0): ItemId | null {
  const item = commitNewItem('add', kind, rotation, snapToGrid(kind, rotation, at.x, at.z));
  if (!item) return null;
  const t = tr();
  announce(
    t.t('announce.added', { tag: item.tag, ...positionParams(t, item) }) + clearanceNote(item.id),
  );
  return item.id;
}

export function moveItem(id: ItemId, to: Point): CommitOutcome | null {
  const item = itemById(id);
  if (!item) return null;
  const position = snapToGrid(item.kind, item.rotation, to.x, to.z);
  const outcome = commitEdit(
    { action: 'move', subject: item.tag },
    [{ type: 'update', id, changes: position }],
    id,
  );
  if (outcome.status === 'rejected') reportEditError(outcome.error);
  if (outcome.status === 'applied') {
    const t = tr();
    announce(
      t.t('announce.moved', { tag: item.tag, ...positionParams(t, position) }) + clearanceNote(id),
    );
  }
  return outcome;
}

export function nudgeSelection(dx: number, dz: number): void {
  const state = get();
  if (state.tool.type === 'place') {
    nudgeGhost(dx, dz);
    return;
  }
  const item = itemById(state.selectedId);
  if (!item) return;
  const target = snapToGrid(
    item.kind,
    item.rotation,
    item.x + dx * FLOOR.cell,
    item.z + dz * FLOOR.cell,
  );
  if (target.x === item.x && target.z === item.z) {
    announce(tr().t('announce.atEdge', { tag: item.tag }));
    return;
  }
  moveItem(item.id, target);
}

export function setItemRotation(id: ItemId, rotation: Rotation): void {
  const item = itemById(id);
  if (!item || item.rotation === rotation) return;
  const outcome = commitEdit(
    { action: 'rotate', subject: item.tag },
    [{ type: 'update', id, changes: { rotation, ...centreAfterRotation(item, rotation) } }],
    id,
  );
  if (outcome.status === 'rejected') reportEditError(outcome.error);
  if (outcome.status === 'applied') {
    const t = tr();
    announce(
      t.t('announce.rotated', { tag: item.tag, rotation: t.degrees(rotation) }) + clearanceNote(id),
    );
  }
}

export function rotateItem(id: ItemId, direction: 1 | -1 = 1): void {
  const item = itemById(id);
  if (item) setItemRotation(id, turn(item.rotation, direction));
}

export function rotateSelection(direction: 1 | -1 = 1): void {
  const state = get();
  if (state.drag) {
    rotateDrag(direction);
    return;
  }
  if (state.tool.type === 'place') {
    rotateTool(direction);
    return;
  }
  if (state.selectedId) rotateItem(state.selectedId, direction);
}

export function renameItem(id: ItemId, tag: string): CommitOutcome {
  const item = itemById(id);
  const subject = normalizeTag(tag);
  const outcome = commitEdit(
    { action: 'rename', subject },
    [{ type: 'update', id, changes: { tag } }],
    id,
  );
  if (item && outcome.status === 'applied') {
    announce(tr().t('announce.renamed', { from: item.tag, to: subject }));
  }
  return outcome;
}

export function removeItem(id: ItemId, selectionAfter?: ItemId): void {
  const item = itemById(id);
  if (!item) return;
  const state = get();
  const outcome = commitEdit(
    { action: 'remove', subject: item.tag },
    [{ type: 'remove', id }],
    selectionAfter ?? (state.selectedId === id ? null : state.selectedId),
    {
      hoveredId: state.hoveredId === id ? null : state.hoveredId,
      drag: state.drag?.id === id ? null : state.drag,
    },
  );
  if (outcome.status === 'applied') {
    announce(tr().t('announce.removed', { tag: item.tag, undoKey: UNDO_SHORTCUT }));
  }
}

export function removeSelection(): void {
  const { selectedId } = get();
  if (selectedId) removeItem(selectedId);
}

export function duplicateSelection(): ItemId | null {
  const source = itemById(get().selectedId);
  if (!source) return null;
  const spot = freeSpot(source.kind, source.rotation, {
    x: source.x + FLOOR.cell * 2,
    z: source.z,
  });
  const item = spot ? commitNewItem('duplicate', source.kind, source.rotation, spot) : null;
  if (!item) return null;
  announce(tr().t('announce.duplicated', { source: source.tag, tag: item.tag }));
  return item.id;
}

export function copySelection(): void {
  const item = itemById(get().selectedId);
  if (!item) return;
  set({ clipboard: { kind: item.kind, rotation: item.rotation } });
  announce(tr().t('announce.copied', { tag: item.tag, pasteKey: PASTE_SHORTCUT }));
}

export function pasteClipboard(near?: Point): ItemId | null {
  const { clipboard, selectedId } = get();
  const t = tr();
  if (!clipboard) {
    announce(t.t('announce.clipboardEmpty', { copyKey: COPY_SHORTCUT }));
    return null;
  }
  const anchor = near ?? itemById(selectedId) ?? ROOM_CENTRE;
  const spot = freeSpot(clipboard.kind, clipboard.rotation, anchor);
  const item = spot ? commitNewItem('paste', clipboard.kind, clipboard.rotation, spot) : null;
  if (!item) return null;
  announce(
    t.t('announce.pasted', { tag: item.tag, ...positionParams(t, item) }) + clearanceNote(item.id),
  );
  return item.id;
}

export function clearLayout(): void {
  const { items } = get();
  if (items.length === 0) return;
  const ops = items.map((item): Op => ({ type: 'remove', id: item.id }));
  const outcome = commitEdit({ action: 'clear', count: items.length }, ops, null, {
    hoveredId: null,
    drag: null,
    proposal: null,
  });
  if (outcome.status === 'applied') {
    announce(tr().t('announce.cleared', { undoKey: UNDO_SHORTCUT }));
  }
}

export function select(id: ItemId | null, options: { readonly announce?: boolean } = {}): void {
  const item = itemById(id);
  const next = item ? item.id : null;
  if (get().selectedId !== next) set({ selectedId: next });
  if (!options.announce) return;
  const t = tr();
  announce(
    item
      ? t.t('announce.selected', {
          tag: item.tag,
          kind: t.kindName(item.kind),
          ...positionParams(t, item),
        }) + clearanceNote(item.id)
      : t.t('announce.deselected'),
  );
}

export function selectRelative(step: 1 | -1): void {
  const { items, selectedId } = get();
  if (items.length === 0) return;
  const index = items.findIndex((item) => item.id === selectedId);
  const nextIndex =
    index === -1
      ? step === 1
        ? 0
        : items.length - 1
      : (index + step + items.length) % items.length;
  select(items[nextIndex]?.id ?? null, { announce: true });
}

export function hover(id: ItemId | null): void {
  if (get().hoveredId !== id) set({ hoveredId: id });
}

export function startPlacement(kind: ItemKind, options: { readonly sticky?: boolean } = {}): void {
  const state = get();
  const rotation: Rotation = 0;
  const anchor = itemById(state.selectedId) ?? ROOM_CENTRE;
  const ghost =
    findFreeSpot(kind, rotation, state.items, anchor) ??
    snapToGrid(kind, rotation, anchor.x, anchor.z);
  set({
    tool: { type: 'place', kind, rotation, sticky: options.sticky ?? false },
    ghost,
    drag: null,
  });
  const t = tr();
  announce(t.t('announce.placing', { kind: t.kindName(kind) }));
}

export function cancelTool(): boolean {
  if (get().tool.type !== 'place') return false;
  set({ tool: { type: 'select' }, ghost: null });
  announce(tr().t('announce.placementCancelled'));
  return true;
}

export function setGhost(point: Point): void {
  const { tool, ghost } = get();
  if (tool.type !== 'place') return;
  const next = snapToGrid(tool.kind, tool.rotation, point.x, point.z);
  if (!ghost || next.x !== ghost.x || next.z !== ghost.z) set({ ghost: next });
}

function nudgeGhost(dx: number, dz: number): void {
  const { tool, ghost } = get();
  if (tool.type !== 'place' || !ghost) return;
  setGhost({ x: ghost.x + dx * FLOOR.cell, z: ghost.z + dz * FLOOR.cell });
  const moved = get().ghost;
  if (!moved) return;
  const t = tr();
  const position = positionParams(t, moved);
  announce(
    moved === ghost ? t.t('announce.ghostAtEdge', position) : t.t('announce.ghostAt', position),
  );
}

export function rotateTool(direction: 1 | -1 = 1): void {
  const { tool, ghost } = get();
  if (tool.type !== 'place' || !ghost) return;
  const rotation = turn(tool.rotation, direction);
  const turned = centreAfterRotation({ ...tool, ...ghost }, rotation);
  set({ tool: { ...tool, rotation }, ghost: turned });
  const t = tr();
  announce(
    t.t('announce.ghostRotated', {
      kind: t.kindName(tool.kind),
      rotation: t.degrees(rotation),
      ...positionParams(t, turned),
    }),
  );
}

export function placeAtGhost(options: { readonly keepPlacing?: boolean } = {}): ItemId | null {
  const { tool, ghost } = get();
  if (tool.type !== 'place' || !ghost) return null;
  const id = addItem(tool.kind, ghost, tool.rotation);
  if (!id) return null;
  if (tool.sticky || options.keepPlacing) {
    const placed = itemById(id);
    const next = placed ? findFreeSpot(tool.kind, tool.rotation, get().items, placed) : null;
    set({ ghost: next ?? ghost });
  } else {
    set({ tool: { type: 'select' }, ghost: null });
  }
  return id;
}

export function beginDrag(id: ItemId): void {
  const item = itemById(id);
  if (!item) return;
  set({ drag: { id, x: item.x, z: item.z, rotation: item.rotation }, selectedId: id });
}

export function updateDrag(point: Point): void {
  const { drag } = get();
  if (!drag) return;
  const item = itemById(drag.id);
  if (!item) {
    set({ drag: null });
    return;
  }
  const next = snapToGrid(item.kind, drag.rotation, point.x, point.z);
  if (next.x !== drag.x || next.z !== drag.z) set({ drag: { ...drag, ...next } });
}

export function rotateDrag(direction: 1 | -1 = 1): void {
  const { drag } = get();
  if (!drag) return;
  const item = itemById(drag.id);
  if (!item) return;
  const rotation = turn(drag.rotation, direction);
  set({ drag: { ...drag, rotation, ...centreAfterRotation({ ...item, ...drag }, rotation) } });
}

export function endDrag(): void {
  const { drag } = get();
  if (!drag) return;
  const item = itemById(drag.id);
  if (!item) {
    set({ drag: null });
    return;
  }
  const rotated = drag.rotation !== item.rotation;
  const turnedInPlace = rotated ? centreAfterRotation(item, drag.rotation) : item;
  const moved = drag.x !== turnedInPlace.x || drag.z !== turnedInPlace.z;
  if (!moved && !rotated) {
    set({ drag: null });
    return;
  }
  const changes: ItemChanges = { x: drag.x, z: drag.z, rotation: drag.rotation };
  const outcome = commitEdit(
    { action: moved ? 'move' : 'rotate', subject: item.tag },
    [{ type: 'update', id: item.id, changes }],
    item.id,
    { drag: null },
  );
  if (outcome.status === 'rejected') reportEditError(outcome.error);
  if (outcome.status === 'applied') {
    const t = tr();
    const message = moved
      ? t.t('announce.moved', { tag: item.tag, ...positionParams(t, drag) })
      : t.t('announce.rotated', { tag: item.tag, rotation: t.degrees(drag.rotation) });
    announce(message + clearanceNote(item.id));
  }
}

export function cancelDrag(): boolean {
  if (!get().drag) return false;
  set({ drag: null });
  announce(tr().t('announce.dragCancelled'));
  return true;
}

export function showProposal(proposal: Proposal | null): void {
  set({ proposal });
}

type ProposalResult = 'applied' | 'unchanged' | 'stale' | 'rejected' | 'missing';

export function acceptProposal(options: { readonly announce?: boolean } = {}): ProposalResult {
  const state = get();
  const { proposal, selectedId } = state;
  if (!proposal) return 'missing';
  if (selectProposalStale(state)) {
    notify('info', tr().t('notice.proposalStale'));
    return 'stale';
  }
  const outcome = commitEdit(
    { action: 'assistant', count: proposal.moves.length },
    proposalOps(proposal),
    selectedId,
    { proposal: null },
  );
  if (outcome.status === 'rejected') {
    reportEditError(outcome.error);
    return 'rejected';
  }
  if (outcome.status === 'unchanged') return 'unchanged';
  if (options.announce ?? true) {
    announce(tr().t('announce.proposalApplied', { undoKey: UNDO_SHORTCUT }));
  }
  return 'applied';
}

export function rejectProposal(): void {
  if (get().proposal) set({ proposal: null });
}

function selectionIfPresent(id: ItemId | null, items: readonly PlacedItem[]): ItemId | null {
  return id !== null && items.some((item) => item.id === id) ? id : null;
}

function stepHistory(direction: 'undo' | 'redo'): void {
  if (cancelDrag()) return;
  const undoing = direction === 'undo';
  const t = tr();
  const outcome = (undoing ? undoDoc : redoDoc)(get());
  if (outcome.status === 'empty') {
    announce(t.t(undoing ? 'announce.nothingToUndo' : 'announce.nothingToRedo'));
    return;
  }
  if (outcome.status === 'conflict') {
    set({ history: outcome.state.history, drag: null });
    notify('error', t.t('error.history-reset'));
    return;
  }
  const { tx, state } = outcome;
  set({
    ...state,
    drag: null,
    selectedId: selectionIfPresent(undoing ? tx.selectionBefore : tx.selectionAfter, state.items),
  });
  const action = describeEdit(t, tx.label);
  announce(t.t(undoing ? 'announce.undone' : 'announce.redone', { action }));
}

export function undo(): void {
  stepHistory('undo');
}

export function redo(): void {
  stepHistory('redo');
}

export function setLocale(locale: Locale): void {
  if (get().locale !== locale) set({ locale });
  saveLocalePreference(locale);
}

export function setInspectorTab(tab: InspectorTab): void {
  set({ inspectorTab: tab });
}

export function toggleStats(): void {
  set((state) => ({ showStats: !state.showStats }));
}

export function setCameraView(view: CameraView): void {
  set((state) => ({
    camera: { view, seq: state.camera.seq + 1, focusId: null, zoom: null, turn: null },
  }));
}

export function focusItem(id: ItemId): void {
  set((state) => ({
    camera: { ...state.camera, seq: state.camera.seq + 1, focusId: id, zoom: null, turn: null },
  }));
}

export function zoomCamera(direction: ZoomDirection): void {
  set((state) => ({
    camera: { ...state.camera, seq: state.camera.seq + 1, zoom: direction, turn: null },
  }));
}

export function turnCamera(direction: TurnDirection): void {
  set((state) => ({
    camera: { ...state.camera, seq: state.camera.seq + 1, zoom: null, turn: direction },
  }));
}

export function focusSelection(): void {
  const { selectedId } = get();
  if (selectedId) focusItem(selectedId);
}
