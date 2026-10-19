import { describe, expect, test } from 'vitest';
import { itemRect } from './grid';
import { findViolations, rectGap } from './rules';
import { generateLayout, sampleLayout } from './seed';
import { parseLayout, serializeLayout } from './serialize';
import { ITEM_KINDS, type ItemKind, type PlacedItem } from './types';

function countByKind(items: readonly PlacedItem[]): Record<ItemKind, number> {
  const counts: Record<ItemKind, number> = { cabinet: 0, drive: 0, transformer: 0, ups: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

function roundTrip(items: readonly PlacedItem[]): readonly PlacedItem[] | null {
  const data: unknown = JSON.parse(serializeLayout(items));
  return parseLayout(data);
}

describe('sampleLayout', () => {
  test('is a valid layout: inside the room, on the grid, with unique ids and tags', () => {
    const items = sampleLayout();
    expect(items).toHaveLength(12);
    expect(roundTrip(items)).toEqual(items);
  });

  test('uses every item type', () => {
    expect(new Set(sampleLayout().map((item) => item.kind))).toEqual(new Set(ITEM_KINDS));
  });

  test('starts with exactly one clearance problem: TR-01 and UPS-01, 0.5 m apart', () => {
    const items = sampleLayout();
    const tagOf = new Map(items.map((item) => [item.id, item.tag]));
    expect(
      findViolations(items).map((violation) => ({
        a: tagOf.get(violation.a),
        b: tagOf.get(violation.b),
        gap: violation.gap,
        overlap: violation.overlap,
      })),
    ).toEqual([{ a: 'TR-01', b: 'UPS-01', gap: 0.5, overlap: false }]);
  });

  test('returns a fresh, equal copy every time', () => {
    const first = sampleLayout();
    expect(sampleLayout()).not.toBe(first);
    expect(sampleLayout()).toEqual(first);
  });
});

describe('generateLayout', () => {
  const items = generateLayout(500);

  test('creates exactly 500 items in the documented mix of types', () => {
    expect(items).toHaveLength(500);
    expect(countByKind(items)).toEqual({ transformer: 20, ups: 30, cabinet: 200, drive: 250 });
  });

  test('never overlaps two footprints', () => {
    const rects = items.map(itemRect);
    const overlaps: string[] = [];
    rects.forEach((a, i) => {
      rects.slice(i + 1).forEach((b, offset) => {
        if (rectGap(a, b).overlap) overlaps.push(`${String(i)}/${String(i + 1 + offset)}`);
      });
    });
    expect(overlaps).toEqual([]);
  });

  test('passes every layout rule: inside the room, on the grid, unique ids and tags', () => {
    expect(roundTrip(items)).toEqual(items);
  });

  test('is deterministic for a seed and differs between seeds', () => {
    expect(generateLayout(500)).toEqual(items);
    expect(generateLayout(500, 1)).toEqual(items);
    expect(generateLayout(500, 2)).not.toEqual(items);
    expect(generateLayout(500, 2)).toEqual(generateLayout(500, 2));
  });

  test('handles small counts', () => {
    expect(generateLayout(0)).toEqual([]);
    expect(generateLayout(1)).toHaveLength(1);
    expect(generateLayout(25)).toHaveLength(25);
  });
});
