import { isInsideRoom, isOnGrid, itemRect } from './grid';
import type { ItemId, PlacedItem, Rotation } from './types';

export const TAG_MAX_LENGTH = 24;

export interface ItemChanges {
  readonly x?: number;
  readonly z?: number;
  readonly rotation?: Rotation;
  readonly tag?: string;
}

export type Op =
  | { readonly type: 'add'; readonly item: PlacedItem; readonly index: number }
  | { readonly type: 'remove'; readonly id: ItemId }
  | { readonly type: 'update'; readonly id: ItemId; readonly changes: ItemChanges };

export type EditError =
  | { readonly code: 'unknown-item'; readonly id: ItemId }
  | { readonly code: 'duplicate-id'; readonly id: ItemId }
  | { readonly code: 'out-of-bounds'; readonly id: ItemId }
  | { readonly code: 'off-grid'; readonly id: ItemId }
  | { readonly code: 'empty-tag'; readonly id: ItemId }
  | { readonly code: 'tag-too-long'; readonly id: ItemId }
  | { readonly code: 'duplicate-tag'; readonly id: ItemId; readonly tag: string };

export type ApplyResult =
  | { readonly ok: true; readonly items: readonly PlacedItem[]; readonly inverse: readonly Op[] }
  | { readonly ok: false; readonly error: EditError };

type OpResult =
  | { readonly ok: true; readonly items: readonly PlacedItem[]; readonly inverse: Op }
  | { readonly ok: false; readonly error: EditError };

export function normalizeTag(tag: string): string {
  return tag
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .normalize('NFKC')
    .trim();
}

export function validateItem(item: PlacedItem, items: readonly PlacedItem[]): EditError | null {
  const rect = itemRect(item);
  if (!isInsideRoom(rect)) return { code: 'out-of-bounds', id: item.id };
  if (!isOnGrid(rect)) return { code: 'off-grid', id: item.id };
  if (item.tag.length === 0) return { code: 'empty-tag', id: item.id };
  if (item.tag.length > TAG_MAX_LENGTH) return { code: 'tag-too-long', id: item.id };
  const tag = item.tag.toLowerCase();
  if (items.some((other) => other.id !== item.id && other.tag.toLowerCase() === tag)) {
    return { code: 'duplicate-tag', id: item.id, tag: item.tag };
  }
  return null;
}

function applyOp(items: readonly PlacedItem[], op: Op): OpResult {
  switch (op.type) {
    case 'add': {
      if (items.some((existing) => existing.id === op.item.id)) {
        return { ok: false, error: { code: 'duplicate-id', id: op.item.id } };
      }
      const item: PlacedItem = { ...op.item, tag: normalizeTag(op.item.tag) };
      const error = validateItem(item, items);
      if (error) return { ok: false, error };
      const index = Math.max(0, Math.min(op.index, items.length));
      return {
        ok: true,
        items: [...items.slice(0, index), item, ...items.slice(index)],
        inverse: { type: 'remove', id: item.id },
      };
    }
    case 'remove': {
      const index = items.findIndex((existing) => existing.id === op.id);
      const item = items[index];
      if (!item) return { ok: false, error: { code: 'unknown-item', id: op.id } };
      return {
        ok: true,
        items: [...items.slice(0, index), ...items.slice(index + 1)],
        inverse: { type: 'add', item, index },
      };
    }
    case 'update': {
      const index = items.findIndex((existing) => existing.id === op.id);
      const item = items[index];
      if (!item) return { ok: false, error: { code: 'unknown-item', id: op.id } };
      const { changes } = op;
      const next: PlacedItem = {
        ...item,
        x: changes.x ?? item.x,
        z: changes.z ?? item.z,
        rotation: changes.rotation ?? item.rotation,
        tag: changes.tag === undefined ? item.tag : normalizeTag(changes.tag),
      };
      const previous: ItemChanges = {
        ...(changes.x === undefined ? {} : { x: item.x }),
        ...(changes.z === undefined ? {} : { z: item.z }),
        ...(changes.rotation === undefined ? {} : { rotation: item.rotation }),
        ...(changes.tag === undefined ? {} : { tag: item.tag }),
      };
      const inverse: Op = { type: 'update', id: item.id, changes: previous };
      const unchanged =
        next.x === item.x &&
        next.z === item.z &&
        next.rotation === item.rotation &&
        next.tag === item.tag;
      if (unchanged) return { ok: true, items, inverse };
      const error = validateItem(next, items);
      if (error) return { ok: false, error };
      return { ok: true, items: items.with(index, next), inverse };
    }
  }
}

export function applyOps(items: readonly PlacedItem[], ops: readonly Op[]): ApplyResult {
  let current = items;
  const inverse: Op[] = [];
  for (const op of ops) {
    const step = applyOp(current, op);
    if (!step.ok) return step;
    current = step.items;
    inverse.unshift(step.inverse);
  }
  return { ok: true, items: current, inverse };
}
