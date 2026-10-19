import { afterAll, expect, test } from 'vitest';
import { deriveBom } from '../domain/bom';
import { CATALOG } from '../domain/catalog';
import { applyOps, type Op } from '../domain/ops';
import { findViolations } from '../domain/rules';
import { generateLayout } from '../domain/seed';
import { parseLayout, serializeLayout } from '../domain/serialize';
import { toItemId, type PlacedItem } from '../domain/types';

const HALL_PITCH = 1.5;
const SHIFTED_EVERY = 20;
const WARM_UP_RUNS = 3;

const rows: { measurement: string; items: number; runs: number; medianMs: number }[] = [];

function hall(count: number): PlacedItem[] {
  const columns = Math.ceil(Math.sqrt(count));
  const { width, depth } = CATALOG.drive;
  return Array.from({ length: count }, (_, i) => ({
    id: toItemId(`hall-${String(i)}`),
    kind: 'drive',
    tag: `VFD-${String(i)}`,
    x: (i % columns) * HALL_PITCH + (i % SHIFTED_EVERY === 0 ? 0.5 : 0) + width / 2,
    z: Math.floor(i / columns) * HALL_PITCH + depth / 2,
    rotation: 0,
  }));
}

function removeAll(items: readonly PlacedItem[]): Op[] {
  return items.map((item) => ({ type: 'remove', id: item.id }));
}

function measure(measurement: string, items: number, runs: number, run: () => unknown): void {
  for (let warmUp = 0; warmUp < WARM_UP_RUNS; warmUp++) run();
  const samples = Array.from({ length: runs }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  const median = samples[Math.floor(runs / 2)] ?? Number.NaN;
  rows.push({ measurement, items, runs, medianMs: Number(median.toFixed(3)) });
}

afterAll(() => {
  console.log(
    `${navigator.userAgent}, ${String(navigator.hardwareConcurrency)} cores; the median of an odd number of runs, after ${String(WARM_UP_RUNS)} warm-up runs`,
  );
  console.table(rows);
});

test('seeded layouts: draft load and undo of a clear, both N add ops', () => {
  for (const size of [2000, 10000]) {
    const items = generateLayout(size);
    const draft = serializeLayout(items);
    const cleared = applyOps(items, removeAll(items));
    if (!cleared.ok) throw new Error('The clear was rejected.');
    expect(parseLayout(JSON.parse(draft))).toHaveLength(size);
    const runs = size > 5000 ? 5 : 21;
    measure('draft load: JSON.parse and parseLayout', size, runs, () =>
      parseLayout(JSON.parse(draft)),
    );
    measure('undo of a clear: N adds', size, runs, () => applyOps([], cleared.inverse));
  }
});

test('seeded layouts: the ?seed=500 and ?seed=2000 clearance check', () => {
  for (const size of [500, 2000]) {
    const items = generateLayout(size);
    const violations = findViolations(items).length;
    measure(`findViolations, seeded (${String(violations)} violations)`, size, 31, () =>
      findViolations(items),
    );
  }
});

test('halls: clearance check, BOM, one move, clear', () => {
  for (const size of [500, 2000, 10000]) {
    const items = hall(size);
    const runs = size > 5000 ? 31 : 101;
    const first = items[0];
    if (!first) throw new Error('The hall is empty.');
    const move: Op[] = [{ type: 'update', id: first.id, changes: { x: first.x + 0.5 } }];
    expect(applyOps(items, move).ok).toBe(true);
    const violations = findViolations(items).length;
    measure(`findViolations, hall (${String(violations)} violations)`, size, runs, () =>
      findViolations(items),
    );
    measure('deriveBom', size, runs, () => deriveBom(items));
    measure('one move: validate and apply', size, runs, () => applyOps(items, move));
    measure('clear: one transaction of N removes', size, size > 5000 ? 5 : 21, () =>
      applyOps(items, removeAll(items)),
    );
  }
});
