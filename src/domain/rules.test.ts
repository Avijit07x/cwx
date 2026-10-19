import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { itemRect } from './grid';
import {
  findViolations,
  isTooClose,
  itemsTooCloseTo,
  MIN_CLEARANCE,
  otherItem,
  rectGap,
  violatingIds,
  violationsInvolving,
  type Violation,
} from './rules';
import { generateLayout } from './seed';
import { ITEM_KINDS, ROTATIONS, toItemId, type PlacedItem, type Rect } from './types';

function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, minZ, maxX, maxZ };
}

function drive(tag: string, x: number, z: number): PlacedItem {
  return makeItem({ kind: 'drive', tag, x, z });
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLayout(seed: number, count: number): PlacedItem[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: toItemId(`random-${seed}-${index}`),
    kind: ITEM_KINDS[Math.floor(random() * ITEM_KINDS.length)] ?? 'drive',
    rotation: ROTATIONS[Math.floor(random() * ROTATIONS.length)] ?? 0,
    tag: `R-${index}`,
    x: -1 + random() * 22,
    z: -1 + random() * 14,
  }));
}

function bruteForce(items: readonly PlacedItem[], minGap: number): Violation[] {
  const found: Violation[] = [];
  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) {
      const gap = rectGap(itemRect(a), itemRect(b));
      if (isTooClose(gap.gap, minGap)) found.push({ rule: 'clearance', a: a.id, b: b.id, ...gap });
    }
  });
  return found;
}

describe('rectGap', () => {
  test('measures the edge-to-edge distance along one axis', () => {
    expect(rectGap(rect(0, 0, 1, 1), rect(1.5, 0, 2, 1))).toEqual({ gap: 0.5, overlap: false });
    expect(rectGap(rect(0, 0, 1, 1), rect(0.2, 2, 0.8, 3))).toEqual({ gap: 1, overlap: false });
  });

  test('measures diagonal neighbours corner to corner', () => {
    expect(rectGap(rect(0, 0, 1, 1), rect(1.3, 1.4, 2, 2)).gap).toBeCloseTo(0.5, 10);
  });

  test('touching footprints have no gap and do not overlap', () => {
    expect(rectGap(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toEqual({ gap: 0, overlap: false });
    expect(rectGap(rect(0, 0, 1, 1), rect(1, 1, 2, 2))).toEqual({ gap: 0, overlap: false });
  });

  test('overlapping footprints are flagged, including one inside the other', () => {
    expect(rectGap(rect(0, 0, 1, 1), rect(0.5, 0.5, 1.5, 1.5))).toEqual({ gap: 0, overlap: true });
    expect(rectGap(rect(0, 0, 2, 2), rect(0.5, 0.5, 1, 1))).toEqual({ gap: 0, overlap: true });
  });
});

describe('isTooClose', () => {
  test('the minimum clearance is 0.6 m', () => {
    expect(MIN_CLEARANCE).toBe(0.6);
  });

  test('a gap strictly below 0.6 m violates; exactly 0.6 m and more passes', () => {
    expect(isTooClose(0)).toBe(true);
    expect(isTooClose(0.5)).toBe(true);
    expect(isTooClose(0.599)).toBe(true);
    expect(isTooClose(0.6)).toBe(false);
    expect(isTooClose(1)).toBe(false);
  });

  test('floating-point noise around 0.6 m does not flip the result', () => {
    expect(isTooClose(1.1 - 0.5)).toBe(false);
    expect(isTooClose(0.6 - 1e-12)).toBe(false);
    expect(isTooClose(0.6 + 1e-12)).toBe(false);
  });

  test('takes a custom minimum', () => {
    expect(isTooClose(0.7, 0.8)).toBe(true);
    expect(isTooClose(0.8, 0.8)).toBe(false);
  });
});

describe('itemsTooCloseTo', () => {
  test('lists the items closer than 0.6 m to a footprint, in list order', () => {
    const near = drive('VFD-01', 1.25, 0.25);
    const clear = drive('VFD-02', 1.35, 0.25);
    const touching = drive('VFD-03', 0.25, 0.75);
    expect(itemsTooCloseTo(rect(0, 0, 0.5, 0.5), [near, clear, touching])).toEqual([
      near,
      touching,
    ]);
  });
});

describe('findViolations', () => {
  test('two items 0.5 m apart violate, naming both with the gap', () => {
    const a = drive('VFD-01', 0.25, 0.25);
    const b = drive('VFD-02', 1.25, 0.25);
    expect(findViolations([a, b])).toEqual([
      { rule: 'clearance', a: a.id, b: b.id, gap: 0.5, overlap: false },
    ]);
  });

  test('items exactly 0.6 m apart pass, along either axis', () => {
    const a = drive('VFD-01', 0.25, 0.25);
    expect(findViolations([a, drive('VFD-02', 1.35, 0.25)])).toEqual([]);
    expect(findViolations([a, drive('VFD-03', 0.25, 1.35)])).toEqual([]);
  });

  test('items 1.0 m apart pass', () => {
    expect(findViolations([drive('VFD-01', 0.25, 0.25), drive('VFD-02', 1.75, 0.25)])).toEqual([]);
  });

  test('diagonal neighbours are measured by their true distance, not per axis', () => {
    const a = drive('VFD-01', 0.25, 0.25);
    const oneCellDiagonal = drive('VFD-02', 1.25, 1.25);
    const closePerAxisApartInTotal = drive('VFD-03', 1.2, 1.2);
    const closeInTotal = drive('VFD-04', 1.05, 1.15);
    expect(findViolations([a, oneCellDiagonal])).toEqual([]);
    expect(findViolations([a, closePerAxisApartInTotal])).toEqual([]);
    const [violation] = findViolations([a, closeInTotal]);
    expect(violation?.gap).toBeCloseTo(0.5, 10);
  });

  test('touching and overlapping items always violate, and only overlap is flagged as such', () => {
    const a = drive('VFD-01', 0.25, 0.25);
    const touching = drive('VFD-02', 0.75, 0.25);
    const stacked = drive('VFD-03', 0.25, 0.25);
    expect(findViolations([a, touching, stacked])).toEqual([
      { rule: 'clearance', a: a.id, b: touching.id, gap: 0, overlap: false },
      { rule: 'clearance', a: a.id, b: stacked.id, gap: 0, overlap: true },
      { rule: 'clearance', a: touching.id, b: stacked.id, gap: 0, overlap: false },
    ]);
  });

  test('uses the rotated footprint', () => {
    const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 0.5, z: 0.25 });
    const turned: PlacedItem = { ...cabinet, rotation: 90, x: 0.25, z: 0.5 };
    const neighbour = drive('VFD-01', 1.75, 0.25);
    expect(findViolations([cabinet, neighbour])).toHaveLength(1);
    expect(findViolations([turned, neighbour])).toEqual([]);
  });

  test('lists each pair once, ordered by list position', () => {
    const a = drive('A', 5.25, 5.25);
    const b = drive('B', 4.25, 5.25);
    const c = drive('C', 6.25, 5.25);
    expect(findViolations([a, b, c]).map((violation) => [violation.a, violation.b])).toEqual([
      [a.id, b.id],
      [a.id, c.id],
    ]);
    expect(findViolations([c, b, a]).map((violation) => [violation.a, violation.b])).toEqual([
      [c.id, a.id],
      [b.id, a.id],
    ]);
  });

  test('empty and single-item layouts have no violations', () => {
    expect(findViolations([])).toEqual([]);
    expect(findViolations([drive('VFD-01', 10.25, 6.25)])).toEqual([]);
  });
});

describe('spatial index', () => {
  test.each([0.6, 1.3, 2.5, 4.5])(
    'finds exactly the pairs a brute-force check finds on random layouts (minimum %s m)',
    (minGap) => {
      for (let seed = 1; seed <= 12; seed++) {
        const items = randomLayout(seed, 40 + seed * 10);
        expect(findViolations(items, minGap), `seed ${seed}`).toEqual(bruteForce(items, minGap));
      }
    },
  );

  test('finds exactly the pairs a brute-force check finds on grid-aligned layouts', () => {
    const cases: readonly (readonly [number, number])[] = [
      [120, 1],
      [300, 2],
      [500, 1],
      [800, 7],
    ];
    for (const [count, seed] of cases) {
      const items = generateLayout(count, seed);
      expect(findViolations(items), `${count} items, seed ${seed}`).toEqual(
        bruteForce(items, MIN_CLEARANCE),
      );
    }
  });
});

describe('violation helpers', () => {
  const a = toItemId('a');
  const b = toItemId('b');
  const c = toItemId('c');
  const violations: readonly Violation[] = [
    { rule: 'clearance', a, b, gap: 0.5, overlap: false },
    { rule: 'clearance', a: b, b: c, gap: 0, overlap: true },
  ];

  test('violatingIds collects every item that takes part in a violation', () => {
    expect(violatingIds(violations)).toEqual(new Set([a, b, c]));
    expect(violatingIds([])).toEqual(new Set());
  });

  test('violationsInvolving and otherItem find an item’s problems and who is on the other side', () => {
    expect(violationsInvolving(c, violations)).toEqual([violations[1]]);
    expect(violationsInvolving(b, violations).map((violation) => otherItem(violation, b))).toEqual([
      a,
      c,
    ]);
  });
});
