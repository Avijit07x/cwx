import { describe, expect, test, vi } from 'vitest';
import { CATALOG } from './catalog';
import {
  centreAfterRotation,
  FLOOR,
  footprint,
  gridPositions,
  isInsideRoom,
  isOnGrid,
  itemRect,
  rectAt,
  snapToGrid,
} from './grid';
import {
  ITEM_KINDS,
  newId,
  newItemId,
  ROTATIONS,
  toItemId,
  turn,
  type ItemKind,
  type PlacedItem,
  type Point,
  type Rect,
  type Rotation,
} from './types';

const COMBINATIONS = ITEM_KINDS.flatMap((kind) =>
  ROTATIONS.map((rotation) => ({ kind, rotation })),
);

const DIRECTIONS: readonly (1 | -1)[] = [1, -1];

const SAMPLE_POINTS: readonly Point[] = Array.from({ length: 70 }, (_, i) => -3 + i * 0.37).flatMap(
  (x) => Array.from({ length: 44 }, (_, j) => ({ x, z: -3 + j * 0.41 })),
);

function isWholeCells(value: number): boolean {
  return Number.isInteger(value / FLOOR.cell);
}

function isPlaceable(rect: Rect): boolean {
  return (
    rect.minX >= 0 &&
    rect.minZ >= 0 &&
    rect.maxX <= FLOOR.width &&
    rect.maxZ <= FLOOR.depth &&
    isWholeCells(rect.minX) &&
    isWholeCells(rect.minZ) &&
    isWholeCells(rect.maxX) &&
    isWholeCells(rect.maxZ)
  );
}

function placed(kind: ItemKind, rotation: Rotation, point: Point): PlacedItem {
  return { id: toItemId('turning'), kind, tag: 'T-1', rotation, x: point.x, z: point.z };
}

function turnItem(item: PlacedItem, direction: 1 | -1): PlacedItem {
  const rotation = turn(item.rotation, direction);
  return { ...item, rotation, ...centreAfterRotation(item, rotation) };
}

function wallsTouched(item: PlacedItem): string[] {
  const { minX, minZ, maxX, maxZ } = itemRect(item);
  const walls = {
    west: minX === 0,
    north: minZ === 0,
    east: maxX === FLOOR.width,
    south: maxZ === FLOOR.depth,
  };
  return Object.entries(walls).flatMap(([wall, touches]) => (touches ? [wall] : []));
}

const STARTS: readonly PlacedItem[] = COMBINATIONS.flatMap(({ kind, rotation }) =>
  gridPositions(kind, rotation).map((point) => placed(kind, rotation, point)),
);

describe('room and catalogue', () => {
  test('the room is 20 m by 12 m with 0.5 m cells', () => {
    expect(FLOOR).toEqual({ width: 20, depth: 12, cell: 0.5 });
  });

  test('the catalogue has the four specified item types with their sizes and tag prefixes', () => {
    const summary = ITEM_KINDS.map((kind) => {
      const { width, depth, height, tagPrefix } = CATALOG[kind];
      return { kind, width, depth, height, tagPrefix };
    });
    expect(summary).toEqual([
      { kind: 'cabinet', width: 1, depth: 0.5, height: 2, tagPrefix: 'CAB' },
      { kind: 'drive', width: 0.5, depth: 0.5, height: 1.8, tagPrefix: 'VFD' },
      { kind: 'transformer', width: 1.5, depth: 1, height: 1.8, tagPrefix: 'TR' },
      { kind: 'ups', width: 1, depth: 1, height: 1.6, tagPrefix: 'UPS' },
    ]);
  });

  test('every footprint side is a whole number of cells, so snapped edges stay on grid lines', () => {
    const offGrid = ITEM_KINDS.filter(
      (kind) => !isWholeCells(CATALOG[kind].width) || !isWholeCells(CATALOG[kind].depth),
    );
    expect(offGrid).toEqual([]);
  });
});

describe('footprint', () => {
  test.each(ITEM_KINDS)('%s keeps its size at 0° and 180° and swaps it at 90° and 270°', (kind) => {
    const { width, depth } = CATALOG[kind];
    expect(footprint(kind, 0)).toEqual({ w: width, d: depth });
    expect(footprint(kind, 180)).toEqual({ w: width, d: depth });
    expect(footprint(kind, 90)).toEqual({ w: depth, d: width });
    expect(footprint(kind, 270)).toEqual({ w: depth, d: width });
  });

  test('rectAt centres the rotated footprint on the point', () => {
    expect(rectAt('transformer', 90, 4, 9.25)).toEqual({
      minX: 3.5,
      minZ: 8.5,
      maxX: 4.5,
      maxZ: 10,
    });
    expect(rectAt('cabinet', 0, 3, 1.25)).toEqual({ minX: 2.5, minZ: 1, maxX: 3.5, maxZ: 1.5 });
  });
});

describe('snapToGrid', () => {
  test('puts the footprint edges on the nearest 0.5 m grid lines', () => {
    expect(snapToGrid('cabinet', 0, 3.1, 1.3)).toEqual({ x: 3, z: 1.25 });
    expect(snapToGrid('cabinet', 90, 3.1, 1.3)).toEqual({ x: 3.25, z: 1.5 });
    expect(snapToGrid('transformer', 0, 15.8, 2.45)).toEqual({ x: 15.75, z: 2.5 });
    expect(snapToGrid('ups', 180, 10.1, 7.9)).toEqual({ x: 10, z: 8 });
  });

  test('keeps every kind and rotation on the grid and inside the room, wherever the point is', () => {
    const failures = COMBINATIONS.flatMap(({ kind, rotation }) =>
      SAMPLE_POINTS.filter((point) => {
        const snapped = snapToGrid(kind, rotation, point.x, point.z);
        return !isPlaceable(rectAt(kind, rotation, snapped.x, snapped.z));
      }).map((point) => ({ kind, rotation, point })),
    );
    expect(failures).toEqual([]);
  });

  test('moves a point that already fits in the room by at most a quarter metre per axis', () => {
    const failures = COMBINATIONS.flatMap(({ kind, rotation }) =>
      SAMPLE_POINTS.filter((point) => {
        const rect = rectAt(kind, rotation, point.x, point.z);
        const fits =
          rect.minX >= 0 && rect.minZ >= 0 && rect.maxX <= FLOOR.width && rect.maxZ <= FLOOR.depth;
        if (!fits) return false;
        const snapped = snapToGrid(kind, rotation, point.x, point.z);
        return Math.abs(snapped.x - point.x) > 0.25 || Math.abs(snapped.z - point.z) > 0.25;
      }).map((point) => ({ kind, rotation, point })),
    );
    expect(failures).toEqual([]);
  });

  test('clamps points outside the room against the nearest walls', () => {
    expect(snapToGrid('drive', 0, -5, -5)).toEqual({ x: 0.25, z: 0.25 });
    expect(snapToGrid('drive', 0, 100, 100)).toEqual({ x: 19.75, z: 11.75 });
    expect(snapToGrid('transformer', 90, 50, -2)).toEqual({ x: 19.5, z: 0.75 });
    expect(snapToGrid('cabinet', 0, -5, 50)).toEqual({ x: 0.5, z: 11.75 });
  });

  test('leaves valid positions where they are and is idempotent', () => {
    const moved = COMBINATIONS.flatMap(({ kind, rotation }) =>
      gridPositions(kind, rotation)
        .filter((point) => {
          const snapped = snapToGrid(kind, rotation, point.x, point.z);
          return snapped.x !== point.x || snapped.z !== point.z;
        })
        .map((point) => ({ kind, rotation, point })),
    );
    expect(moved).toEqual([]);

    const unstable = COMBINATIONS.flatMap(({ kind, rotation }) =>
      SAMPLE_POINTS.filter((point) => {
        const once = snapToGrid(kind, rotation, point.x, point.z);
        const twice = snapToGrid(kind, rotation, once.x, once.z);
        return once.x !== twice.x || once.z !== twice.z;
      }).map((point) => ({ kind, rotation, point })),
    );
    expect(unstable).toEqual([]);
  });
});

describe('quarter turns (centreAfterRotation)', () => {
  test('keep every kind on the grid and inside the room from every position', () => {
    const failures = STARTS.flatMap((item) =>
      DIRECTIONS.map((direction) => turnItem(item, direction))
        .filter((turned) => !isPlaceable(itemRect(turned)))
        .map((turned) => ({ from: item, to: turned })),
    );
    expect(failures).toEqual([]);
  });

  test('turn the item in place: the centre moves at most a quarter metre on each axis', () => {
    const failures = STARTS.flatMap((item) =>
      DIRECTIONS.map((direction) => turnItem(item, direction))
        .filter(
          (turned) => Math.abs(turned.x - item.x) > 0.25 || Math.abs(turned.z - item.z) > 0.25,
        )
        .map((turned) => ({ from: item, to: turned })),
    );
    expect(failures).toEqual([]);
  });

  test('keep the item against every wall it touches, from every position', () => {
    const failures = STARTS.flatMap((item) =>
      DIRECTIONS.map((direction) => turnItem(item, direction))
        .filter((turned) => wallsTouched(item).some((wall) => !wallsTouched(turned).includes(wall)))
        .map((turned) => ({ from: item, to: turned })),
    );
    expect(failures).toEqual([]);
  });

  test('four quarter turns, or a turn and back, return the item to where it started unless a turn brought it against a wall', () => {
    const failures = STARTS.flatMap((item) =>
      DIRECTIONS.flatMap((direction) => {
        let fourTurns = item;
        for (let step = 0; step < 4; step++) fourTurns = turnItem(fourTurns, direction);
        const turnAndBack = turnItem(turnItem(item, direction), direction === 1 ? -1 : 1);
        return [fourTurns, turnAndBack]
          .filter((end) => end.x !== item.x || end.z !== item.z || end.rotation !== item.rotation)
          .filter((end) => wallsTouched(end).every((wall) => wallsTouched(item).includes(wall)))
          .map((end) => ({ start: item, end }));
      }),
    );
    expect(failures).toEqual([]);
  });

  test('a cabinet turned twice comes back to the same footprint', () => {
    const cabinet = placed('cabinet', 0, { x: 3, z: 1.25 });
    const quarter = turnItem(cabinet, 1);
    expect(quarter).toMatchObject({ rotation: 90, x: 2.75, z: 1 });
    expect(turnItem(quarter, -1)).toEqual(cabinet);
  });
});

describe('gridPositions', () => {
  test.each(COMBINATIONS)(
    'lists every valid centre for $kind at $rotation° exactly once',
    ({ kind, rotation }) => {
      const { w, d } = footprint(kind, rotation);
      const columns = (FLOOR.width - w) / FLOOR.cell + 1;
      const rows = (FLOOR.depth - d) / FLOOR.cell + 1;
      const positions = gridPositions(kind, rotation);
      expect(positions).toHaveLength(columns * rows);
      expect(new Set(positions.map((point) => `${point.x}:${point.z}`)).size).toBe(columns * rows);
      expect(
        positions.filter((point) => !isPlaceable(rectAt(kind, rotation, point.x, point.z))),
      ).toEqual([]);
    },
  );
});

describe('room and grid checks', () => {
  test('isInsideRoom accepts footprints touching the walls and rejects any that cross them', () => {
    expect(isInsideRoom({ minX: 0, minZ: 0, maxX: 20, maxZ: 12 })).toBe(true);
    expect(isInsideRoom({ minX: -0.01, minZ: 0, maxX: 1, maxZ: 1 })).toBe(false);
    expect(isInsideRoom({ minX: 0, minZ: -0.01, maxX: 1, maxZ: 1 })).toBe(false);
    expect(isInsideRoom({ minX: 19, minZ: 11, maxX: 20.01, maxZ: 12 })).toBe(false);
    expect(isInsideRoom({ minX: 19, minZ: 11, maxX: 20, maxZ: 12.01 })).toBe(false);
    expect(isInsideRoom({ minX: -1e-9, minZ: 0, maxX: 1, maxZ: 12 + 1e-9 })).toBe(true);
  });

  test('isOnGrid checks the footprint corner against the 0.5 m lines, tolerating float noise', () => {
    expect(isOnGrid(rectAt('cabinet', 0, 3, 1.25))).toBe(true);
    expect(isOnGrid(rectAt('cabinet', 0, 3.25, 1.25))).toBe(false);
    expect(isOnGrid(rectAt('cabinet', 0, 3, 1.5))).toBe(false);
    expect(isOnGrid({ minX: 0.1 + 0.2 + 0.2, minZ: 1.5, maxX: 1.5, maxZ: 2 })).toBe(true);
  });
});

describe('type helpers', () => {
  test('turn steps through the four rotations in both directions', () => {
    expect(ROTATIONS.map((rotation) => turn(rotation))).toEqual([90, 180, 270, 0]);
    expect(ROTATIONS.map((rotation) => turn(rotation, -1))).toEqual([270, 0, 90, 180]);
    expect(ROTATIONS.map((rotation) => turn(turn(rotation, 1), -1))).toEqual([...ROTATIONS]);
  });

  test('newId and newItemId return fresh 32-character hex ids without crypto.randomUUID, which plain-HTTP pages lack', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });
    const ids = new Set(Array.from({ length: 50 }, () => newItemId()));
    expect(ids.size).toBe(50);
    expect([...ids, newId()].filter((id) => !/^[0-9a-f]{32}$/.test(id))).toEqual([]);
  });
});
