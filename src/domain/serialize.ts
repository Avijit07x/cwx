import * as z from 'zod/mini';
import { applyOps, type Op } from './ops';
import { ITEM_KINDS, ROTATIONS, toItemId, type PlacedItem } from './types';

export const LAYOUT_FORMAT_VERSION = 1;

const savedItem = z.object({
  id: z.pipe(z.string().check(z.minLength(1), z.maxLength(64)), z.transform(toItemId)),
  kind: z.enum(ITEM_KINDS),
  tag: z.string(),
  x: z.number(),
  z: z.number(),
  rotation: z.literal(ROTATIONS),
});

const savedLayout = z.object({
  version: z.literal(LAYOUT_FORMAT_VERSION),
  items: z.array(savedItem),
});

export function serializeLayout(items: readonly PlacedItem[]): string {
  return JSON.stringify({ version: LAYOUT_FORMAT_VERSION, items });
}

export function parseLayout(value: unknown): readonly PlacedItem[] | null {
  const saved = savedLayout.safeParse(value);
  if (!saved.success) return null;
  const ops = saved.data.items.map((item, index): Op => ({ type: 'add', item, index }));
  const replay = applyOps([], ops);
  return replay.ok ? replay.items : null;
}
