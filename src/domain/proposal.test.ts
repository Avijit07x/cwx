import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { applyOps } from './ops';
import { applyProposal, isProposalStale, proposalOps, type Proposal } from './proposal';
import { sampleLayout } from './seed';
import type { PlacedItem } from './types';

const LAYOUT = sampleLayout();

function byTag(tag: string): PlacedItem {
  const item = LAYOUT.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No ${tag} in the sample layout`);
  return item;
}

const UPS = byTag('UPS-01');
const VFD = byTag('VFD-04');

const PROPOSAL: Proposal = {
  id: 'proposal-1',
  violationsBefore: 1,
  violationsAfter: 0,
  moves: [
    {
      id: UPS.id,
      tag: 'UPS-01',
      from: { x: 17.5, z: 2.5, rotation: 0 },
      to: { x: 18, z: 2.5, rotation: 0 },
    },
    {
      id: VFD.id,
      tag: 'VFD-04',
      from: { x: 7.75, z: 3.75, rotation: 0 },
      to: { x: 8.25, z: 4.25, rotation: 90 },
    },
  ],
};

function replace(items: readonly PlacedItem[], next: PlacedItem): PlacedItem[] {
  return items.map((item) => (item.id === next.id ? next : item));
}

describe('proposal helpers', () => {
  test('proposalOps turns every move into one update to its target placement', () => {
    expect(proposalOps(PROPOSAL)).toEqual([
      { type: 'update', id: UPS.id, changes: { x: 18, z: 2.5, rotation: 0 } },
      { type: 'update', id: VFD.id, changes: { x: 8.25, z: 4.25, rotation: 90 } },
    ]);
  });

  test('applyProposal moves only the proposed items and keeps the list order', () => {
    const preview = applyProposal(LAYOUT, PROPOSAL);
    expect(preview.map((item) => item.id)).toEqual(LAYOUT.map((item) => item.id));
    expect(preview.find((item) => item.id === UPS.id)).toEqual({ ...UPS, x: 18, z: 2.5 });
    expect(preview.find((item) => item.id === VFD.id)).toEqual({
      ...VFD,
      x: 8.25,
      z: 4.25,
      rotation: 90,
    });
    const others = (items: readonly PlacedItem[]) =>
      items.filter((item) => item.id !== UPS.id && item.id !== VFD.id);
    expect(others(preview)).toEqual(others(LAYOUT));
  });

  test('committing the proposal gives exactly the previewed layout', () => {
    const committed = applyOps(LAYOUT, proposalOps(PROPOSAL));
    if (!committed.ok)
      throw new Error(`Expected the proposal to apply, got ${committed.error.code}`);
    expect(committed.items).toEqual(applyProposal(LAYOUT, PROPOSAL));
  });

  test('a proposal is current while its items are where it found them', () => {
    expect(isProposalStale(PROPOSAL, LAYOUT)).toBe(false);
  });

  test('a proposal goes stale when one of its items moved, turned or was deleted', () => {
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...UPS, x: 18.5 }))).toBe(true);
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...VFD, z: 4.25 }))).toBe(true);
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...VFD, rotation: 180 }))).toBe(true);
    expect(
      isProposalStale(
        PROPOSAL,
        LAYOUT.filter((item) => item.id !== VFD.id),
      ),
    ).toBe(true);
  });

  test('a proposal goes stale when another item now stands too close to one of its targets', () => {
    expect(isProposalStale(PROPOSAL, [...LAYOUT, makeItem({ x: 18.25, z: 2.75 })])).toBe(true);
    const cabinet = byTag('CAB-04');
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...cabinet, z: 4.25 }))).toBe(true);
  });

  test('changes to items outside the proposal do not make it stale', () => {
    const cabinet = byTag('CAB-01');
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...cabinet, x: 12, tag: 'MAIN-01' }))).toBe(
      false,
    );
    expect(isProposalStale(PROPOSAL, [...LAYOUT, makeItem({ x: 10.25, z: 10.25 })])).toBe(false);
    expect(isProposalStale(PROPOSAL, replace(LAYOUT, { ...UPS, tag: 'UPS-99' }))).toBe(false);
  });
});
