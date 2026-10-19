import { EPSILON, itemRect } from './grid';
import type { ItemId, PlacedItem, Rect } from './types';

export const MIN_CLEARANCE = 0.6;

export interface Violation {
  readonly rule: 'clearance';
  readonly a: ItemId;
  readonly b: ItemId;
  readonly gap: number;
  readonly overlap: boolean;
}

interface Gap {
  readonly gap: number;
  readonly overlap: boolean;
}

export function rectGap(a: Rect, b: Rect): Gap {
  const dx = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
  const dz = Math.max(0, b.minZ - a.maxZ, a.minZ - b.maxZ);
  const overlap =
    a.minX < b.maxX - EPSILON &&
    b.minX < a.maxX - EPSILON &&
    a.minZ < b.maxZ - EPSILON &&
    b.minZ < a.maxZ - EPSILON;
  return { gap: Math.hypot(dx, dz), overlap };
}

export function isTooClose(gap: number, minGap = MIN_CLEARANCE): boolean {
  return gap < minGap - EPSILON;
}

export function rectsTooClose(a: Rect, b: Rect, minGap = MIN_CLEARANCE): boolean {
  return isTooClose(rectGap(a, b).gap, minGap);
}

export function itemsTooCloseTo(rect: Rect, items: readonly PlacedItem[]): readonly PlacedItem[] {
  return items.filter((item) => rectsTooClose(rect, itemRect(item)));
}

const BUCKET_SIZE = 2;

function bucketKey(bx: number, bz: number): number {
  return (bx + 1) * 1024 + (bz + 1);
}

function bucketKeys(rect: Rect, pad: number): number[] {
  const x0 = Math.floor((rect.minX - pad) / BUCKET_SIZE);
  const x1 = Math.floor((rect.maxX + pad) / BUCKET_SIZE);
  const z0 = Math.floor((rect.minZ - pad) / BUCKET_SIZE);
  const z1 = Math.floor((rect.maxZ + pad) / BUCKET_SIZE);
  const keys: number[] = [];
  for (let bx = x0; bx <= x1; bx++) {
    for (let bz = z0; bz <= z1; bz++) keys.push(bucketKey(bx, bz));
  }
  return keys;
}

interface RectIndex {
  near(rect: Rect): number[];
}

export function buildRectIndex(rects: readonly Rect[], pad: number): RectIndex {
  const buckets = new Map<number, number[]>();
  rects.forEach((rect, index) => {
    for (const key of bucketKeys(rect, pad)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
  });
  return {
    near(rect) {
      const found = new Set<number>();
      for (const key of bucketKeys(rect, pad)) {
        for (const index of buckets.get(key) ?? []) found.add(index);
      }
      return [...found];
    },
  };
}

export function findViolations(
  items: readonly PlacedItem[],
  minGap = MIN_CLEARANCE,
): readonly Violation[] {
  const rects = items.map(itemRect);
  const index = buildRectIndex(rects, minGap / 2);
  const found: { i: number; j: number; gap: Gap }[] = [];
  rects.forEach((rect, i) => {
    for (const j of index.near(rect)) {
      const other = rects[j];
      if (j <= i || !other) continue;
      const gap = rectGap(rect, other);
      if (isTooClose(gap.gap, minGap)) found.push({ i, j, gap });
    }
  });
  found.sort((p, q) => p.i - q.i || p.j - q.j);
  const violations: Violation[] = [];
  for (const { i, j, gap } of found) {
    const a = items[i];
    const b = items[j];
    if (a && b) violations.push({ rule: 'clearance', a: a.id, b: b.id, ...gap });
  }
  return violations;
}

export function violatingIds(violations: readonly Violation[]): ReadonlySet<ItemId> {
  return new Set(violations.flatMap((violation) => [violation.a, violation.b]));
}

export function violationsInvolving(
  id: ItemId,
  violations: readonly Violation[],
): readonly Violation[] {
  return violations.filter((violation) => violation.a === id || violation.b === id);
}

export function otherItem(violation: Violation, id: ItemId): ItemId {
  return violation.a === id ? violation.b : violation.a;
}
