import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { FLOOR, gridPositions, isInsideRoom, isOnGrid, itemRect, rectAt } from './grid';
import { findFreeSpot } from './placement';
import { isTooClose, MIN_CLEARANCE, rectGap } from './rules';
import { generateLayout } from './seed';
import { ITEM_KINDS, type ItemKind, type PlacedItem, type Point, type Rotation } from './types';

function keepsClearance(
  kind: ItemKind,
  rotation: Rotation,
  point: Point,
  items: readonly PlacedItem[],
  minGap = MIN_CLEARANCE,
): boolean {
  const rect = rectAt(kind, rotation, point.x, point.z);
  return items.every((item) => !isTooClose(rectGap(rect, itemRect(item)).gap, minGap));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('findFreeSpot', () => {
  test('in an empty room returns the grid position nearest to the requested point', () => {
    expect(findFreeSpot('drive', 0, [], { x: 3.3, z: 2.2 })).toEqual({ x: 3.25, z: 2.25 });
    expect(findFreeSpot('cabinet', 0, [], { x: 0, z: 0 })).toEqual({ x: 0.5, z: 0.25 });
    expect(findFreeSpot('cabinet', 90, [], { x: 0, z: 0 })).toEqual({ x: 0.25, z: 0.5 });
  });

  test('breaks ties between equally near positions the same way every time: north, then west', () => {
    expect(findFreeSpot('drive', 0, [], { x: FLOOR.width / 2, z: FLOOR.depth / 2 })).toEqual({
      x: 9.75,
      z: 5.75,
    });
  });

  test('returns the nearest grid position that keeps the clearance to every item', () => {
    const layouts = [generateLayout(40, 2), generateLayout(90, 9)];
    const nearPoints: readonly Point[] = [
      { x: 10, z: 6 },
      { x: 0, z: 0 },
      { x: 19, z: 11.5 },
      { x: 4.4, z: 8.8 },
    ];
    const rotations: readonly Rotation[] = [0, 90];
    const cases = layouts.flatMap((items) =>
      ITEM_KINDS.flatMap((kind) =>
        rotations.flatMap((rotation) =>
          nearPoints.map((near) => ({ items, kind, rotation, near })),
        ),
      ),
    );
    let found = 0;
    for (const { items, kind, rotation, near } of cases) {
      const spot = findFreeSpot(kind, rotation, items, near);
      const free = gridPositions(kind, rotation).filter((point) =>
        keepsClearance(kind, rotation, point, items),
      );
      const label = `${kind} at ${String(rotation)}° near ${String(near.x)}, ${String(near.z)}`;
      if (free.length === 0) {
        expect(spot, label).toBeNull();
        continue;
      }
      if (!spot) throw new Error(`Expected a free spot for ${label}`);
      found += 1;
      const rect = rectAt(kind, rotation, spot.x, spot.z);
      expect(isInsideRoom(rect) && isOnGrid(rect), label).toBe(true);
      expect(keepsClearance(kind, rotation, spot, items), label).toBe(true);
      expect(distance(spot, near), label).toBeCloseTo(
        Math.min(...free.map((point) => distance(point, near))),
        9,
      );
    }
    expect(found).toBeGreaterThan(cases.length / 2);
  });

  test('a gap of exactly the minimum counts as free', () => {
    const existing = makeItem({ kind: 'drive', x: 0.25, z: 0.25 });
    expect(findFreeSpot('drive', 0, [existing], { x: 0.25, z: 0.25 }, 1)).toEqual({
      x: 1.75,
      z: 0.25,
    });
  });

  test('returns null when no position can meet the clearance', () => {
    const existing = makeItem({ kind: 'drive', x: 10.25, z: 6.25 });
    expect(findFreeSpot('drive', 0, [existing], { x: 10, z: 6 }, 25)).toBeNull();
  });

  test('a requested point outside the room still yields a position inside it', () => {
    expect(findFreeSpot('transformer', 0, [], { x: -10, z: 40 })).toEqual({ x: 0.75, z: 11.5 });
  });
});
