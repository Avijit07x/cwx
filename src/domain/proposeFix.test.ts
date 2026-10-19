import { describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { FLOOR, isInsideRoom, isOnGrid, rectAt } from './grid';
import { applyProposal, isProposalStale, type Proposal } from './proposal';
import { MAX_FIX_ATTEMPTS, MAX_FIX_MOVES, proposeClearanceFix } from './proposeFix';
import { findViolations } from './rules';
import { generateLayout, sampleLayout } from './seed';
import type { PlacedItem } from './types';

function required(proposal: Proposal | null): Proposal {
  if (!proposal) throw new Error('Expected a proposal');
  return proposal;
}

function touchingDrivePairs(count: number): PlacedItem[] {
  const items: PlacedItem[] = [];
  for (let pair = 0; pair < count; pair++) {
    const x = 1.25 + (pair % 6) * 3;
    const z = 1.25 + Math.floor(pair / 6) * 3;
    items.push(makeItem({ kind: 'drive', x, z }), makeItem({ kind: 'drive', x: x + 0.5, z }));
  }
  return items;
}

function transformerHall(): PlacedItem[] {
  const items: PlacedItem[] = [];
  for (let x = 0.75; x < FLOOR.width; x += 3) {
    for (let z = 0.5; z < FLOOR.depth; z += 2.5)
      items.push(makeItem({ kind: 'transformer', x, z }));
  }
  return items;
}

function copiesOf(items: readonly PlacedItem[]): PlacedItem[] {
  return items.map((item) => makeItem({ kind: item.kind, x: item.x, z: item.z }));
}

function drivesPressedTogether(column: number, row: number): PlacedItem[] {
  const x = 3 * column + 2.25;
  const z = 2.5 * row + 1.75;
  return [makeItem({ kind: 'drive', x, z }), makeItem({ kind: 'drive', x, z: z - 0.5 })];
}

function tiledUpsRoom(): PlacedItem[] {
  const items: PlacedItem[] = [];
  for (let z = 0.5; z < FLOOR.depth; z += 1) {
    for (let x = 0.5; x < FLOOR.width; x += 1) items.push(makeItem({ kind: 'ups', x, z }));
  }
  return items;
}

describe('proposeClearanceFix', () => {
  it("fixes the sample layout's violation by moving the smaller item to the nearest free spot", () => {
    const items = sampleLayout();
    const proposal = required(proposeClearanceFix(items));

    expect(proposal.violationsBefore).toBe(1);
    expect(proposal.violationsAfter).toBe(0);
    expect(proposal.moves).toEqual([
      {
        id: 'sample-ups-01',
        tag: 'UPS-01',
        from: { x: 17.5, z: 2.5, rotation: 0 },
        to: { x: 18, z: 2.5, rotation: 0 },
      },
    ]);
    expect(findViolations(applyProposal(items, proposal))).toEqual([]);
    expect(isProposalStale(proposal, items)).toBe(false);
  });

  it('proposes a fix without crypto.randomUUID, which plain-HTTP pages lack', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });
    expect(required(proposeClearanceFix(sampleLayout())).id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('moves the item involved in more violations, even when it is larger', () => {
    const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 10, z: 6.25 });
    const west = makeItem({ kind: 'drive', tag: 'VFD-01', x: 9.25, z: 6.25 });
    const east = makeItem({ kind: 'drive', tag: 'VFD-02', x: 10.75, z: 6.25 });
    const items = [west, cabinet, east];

    const proposal = required(proposeClearanceFix(items));

    expect(proposal.violationsBefore).toBe(2);
    expect(proposal.violationsAfter).toBe(0);
    expect(proposal.moves.map((move) => move.tag)).toEqual(['CAB-01']);
  });

  it('keeps every move inside the room and on the grid for dense random layouts', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const items = generateLayout(150, seed);
      const proposal = required(proposeClearanceFix(items));
      for (const move of proposal.moves) {
        const item = items.find((candidate) => candidate.id === move.id);
        if (!item) throw new Error(`Unknown item ${move.id}`);
        const rect = rectAt(item.kind, move.to.rotation, move.to.x, move.to.z);
        expect(isInsideRoom(rect)).toBe(true);
        expect(isOnGrid(rect)).toBe(true);
        expect(move.to.rotation).toBe(item.rotation);
        expect(move.from).toEqual({ x: item.x, z: item.z, rotation: item.rotation });
      }
      const after = findViolations(applyProposal(items, proposal)).length;
      expect(proposal.violationsAfter).toBe(after);
      expect(after).toBeLessThan(proposal.violationsBefore);
      expect(new Set(proposal.moves.map((move) => move.id)).size).toBe(proposal.moves.length);
    }
  });

  it('returns null when there is nothing to fix', () => {
    expect(proposeClearanceFix([])).toBeNull();
    const clean = sampleLayout().filter((item) => item.tag !== 'UPS-01');
    expect(findViolations(clean)).toEqual([]);
    expect(proposeClearanceFix(clean)).toBeNull();
  });

  it('respects the move cap and reports the issues that remain', () => {
    const items = touchingDrivePairs(15);
    expect(findViolations(items)).toHaveLength(15);

    const proposal = required(proposeClearanceFix(items));

    expect(proposal.moves).toHaveLength(MAX_FIX_MOVES);
    expect(proposal.violationsBefore).toBe(15);
    expect(proposal.violationsAfter).toBe(15 - MAX_FIX_MOVES);
    expect(findViolations(applyProposal(items, proposal))).toHaveLength(15 - MAX_FIX_MOVES);
  });

  it('keeps fixing the pairs it can after meeting pairs it cannot', () => {
    const hall = transformerHall();
    const stuck = copiesOf(hall.filter((item) => item.z === 10.5));
    const drives = [0, 1].flatMap((row) =>
      [0, 1, 2, 3, 4].flatMap((column) => drivesPressedTogether(column, row)),
    );
    expect(findViolations(hall)).toEqual([]);

    const proposal = required(proposeClearanceFix([...stuck, ...hall, ...drives]));

    expect(proposal.moves).toHaveLength(drives.length / 2);
    expect(proposal.violationsAfter).toBe(stuck.length);
  });

  it('gives up after MAX_FIX_ATTEMPTS pairs it cannot fix, so a crowded room stays quick', () => {
    const hall = transformerHall();
    const crowded = (stuck: number) => [
      ...copiesOf(hall.slice(0, stuck)),
      ...hall,
      ...drivesPressedTogether(5, 1),
    ];

    expect(proposeClearanceFix(crowded(MAX_FIX_ATTEMPTS - 1))?.moves).toHaveLength(1);
    expect(proposeClearanceFix(crowded(MAX_FIX_ATTEMPTS))).toBeNull();
  });

  it('returns null when no involved item can be moved anywhere', () => {
    const items = tiledUpsRoom();
    expect(items).toHaveLength(240);
    expect(findViolations(items).length).toBeGreaterThan(0);

    expect(proposeClearanceFix(items)).toBeNull();
  });
});
