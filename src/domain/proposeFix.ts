import { footprint } from './grid';
import { findFreeSpot } from './placement';
import type { Placement, Proposal, ProposedMove } from './proposal';
import { findViolations, type Violation } from './rules';
import { newId, type ItemId, type PlacedItem } from './types';

export const MAX_FIX_MOVES = 12;
export const MAX_FIX_ATTEMPTS = 2 * MAX_FIX_MOVES;

function placementOf(item: PlacedItem): Placement {
  return { x: item.x, z: item.z, rotation: item.rotation };
}

function area(item: PlacedItem): number {
  const { w, d } = footprint(item.kind, item.rotation);
  return w * d;
}

function pairKey(violation: Violation): string {
  return `${violation.a}|${violation.b}`;
}

function violationCounts(violations: readonly Violation[]): ReadonlyMap<ItemId, number> {
  const counts = new Map<ItemId, number>();
  for (const { a, b } of violations) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return counts;
}

function movesFirst(
  item: PlacedItem,
  other: PlacedItem,
  counts: ReadonlyMap<ItemId, number>,
): boolean {
  const moreViolations = (counts.get(item.id) ?? 0) - (counts.get(other.id) ?? 0);
  return moreViolations === 0 ? area(item) <= area(other) : moreViolations > 0;
}

function relocated(item: PlacedItem, items: readonly PlacedItem[]): PlacedItem | null {
  const others = items.filter((other) => other.id !== item.id);
  const spot = findFreeSpot(item.kind, item.rotation, others, item);
  return spot ? { ...item, x: spot.x, z: spot.z } : null;
}

export function proposeClearanceFix(items: readonly PlacedItem[]): Proposal | null {
  let working = items;
  let violations = findViolations(working);
  const violationsBefore = violations.length;
  const originals = new Map(items.map((item) => [item.id, item]));
  const moves = new Map<ItemId, ProposedMove>();
  const skipped = new Set<string>();
  let attempts = 0;

  while (violations.length > 0 && moves.size < MAX_FIX_MOVES) {
    const byId = new Map(working.map((item) => [item.id, item]));
    const counts = violationCounts(violations);
    let moved: PlacedItem | null = null;
    for (const violation of violations) {
      if (attempts >= MAX_FIX_ATTEMPTS) break;
      const a = byId.get(violation.a);
      const b = byId.get(violation.b);
      if (!a || !b || skipped.has(pairKey(violation))) continue;
      attempts += 1;
      const [first, second] = movesFirst(b, a, counts) ? [b, a] : [a, b];
      moved = relocated(first, working) ?? relocated(second, working);
      if (moved) break;
      skipped.add(pairKey(violation));
    }
    const original = moved ? originals.get(moved.id) : undefined;
    if (!moved || !original) break;
    const { id, tag } = moved;
    moves.set(id, { id, tag, from: placementOf(original), to: placementOf(moved) });
    working = working.map((item) => (item.id === id ? moved : item));
    violations = findViolations(working);
  }

  if (moves.size === 0) return null;
  return {
    id: newId(),
    moves: [...moves.values()],
    violationsBefore,
    violationsAfter: violations.length,
  };
}
