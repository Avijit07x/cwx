export type ItemId = string & { readonly __brand: 'ItemId' };

export const ITEM_KINDS = ['cabinet', 'drive', 'transformer', 'ups'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Rect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface PlacedItem {
  readonly id: ItemId;
  readonly kind: ItemKind;
  readonly tag: string;
  readonly x: number;
  readonly z: number;
  readonly rotation: Rotation;
}

export function toItemId(value: string): ItemId {
  return value as ItemId;
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newItemId(): ItemId {
  return toItemId(newId());
}

const CLOCKWISE: Readonly<Record<Rotation, Rotation>> = { 0: 90, 90: 180, 180: 270, 270: 0 };
const COUNTER_CLOCKWISE: Readonly<Record<Rotation, Rotation>> = {
  0: 270,
  90: 0,
  180: 90,
  270: 180,
};

export function turn(rotation: Rotation, direction: 1 | -1 = 1): Rotation {
  return direction === 1 ? CLOCKWISE[rotation] : COUNTER_CLOCKWISE[rotation];
}
