import { CATALOG } from './catalog';
import type { ItemKind, PlacedItem } from './types';

export function nextTag(kind: ItemKind, items: readonly PlacedItem[]): string {
  const prefix = CATALOG[kind].tagPrefix;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const used = new Set(items.map((item) => item.tag.toLowerCase()));
  const format = (n: number) => `${prefix}-${String(n).padStart(2, '0')}`;
  const isFree = (tag: string) => !used.has(tag.toLowerCase());

  let highest = 0;
  for (const item of items) {
    const digits = pattern.exec(item.tag)?.[1];
    const value = digits === undefined ? Number.NaN : Number(digits);
    if (Number.isSafeInteger(value)) highest = Math.max(highest, value);
  }

  const following = format(highest + 1);
  if (isFree(following)) return following;
  let n = 1;
  while (!isFree(format(n))) n += 1;
  return format(n);
}
