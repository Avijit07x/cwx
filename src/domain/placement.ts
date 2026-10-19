import { gridPositions, itemRect, rectAt } from './grid';
import { buildRectIndex, MIN_CLEARANCE, rectsTooClose } from './rules';
import type { ItemKind, PlacedItem, Point, Rect, Rotation } from './types';

export function findFreeSpot(
  kind: ItemKind,
  rotation: Rotation,
  items: readonly PlacedItem[],
  near: Point,
  minGap = MIN_CLEARANCE,
): Point | null {
  const rects = items.map(itemRect);
  const index = buildRectIndex(rects, minGap / 2);
  const isFree = (rect: Rect) =>
    index.near(rect).every((i) => {
      const other = rects[i];
      return !other || !rectsTooClose(rect, other, minGap);
    });
  const distance = (p: Point) => (p.x - near.x) ** 2 + (p.z - near.z) ** 2;
  const candidates = gridPositions(kind, rotation).sort(
    (p, q) => distance(p) - distance(q) || p.z - q.z || p.x - q.x,
  );
  return (
    candidates.find((candidate) => isFree(rectAt(kind, rotation, candidate.x, candidate.z))) ?? null
  );
}
