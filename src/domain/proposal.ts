import { itemRect } from './grid';
import type { Op } from './ops';
import { rectsTooClose } from './rules';
import type { ItemId, PlacedItem, Rotation } from './types';

export interface Placement {
  readonly x: number;
  readonly z: number;
  readonly rotation: Rotation;
}

export interface ProposedMove {
  readonly id: ItemId;
  readonly tag: string;
  readonly from: Placement;
  readonly to: Placement;
}

export interface Proposal {
  readonly id: string;
  readonly moves: readonly ProposedMove[];
  readonly violationsBefore: number;
  readonly violationsAfter: number;
}

export function proposalOps(proposal: Proposal): Op[] {
  return proposal.moves.map((move) => ({
    type: 'update',
    id: move.id,
    changes: { x: move.to.x, z: move.to.z, rotation: move.to.rotation },
  }));
}

export function isProposalStale(proposal: Proposal, items: readonly PlacedItem[]): boolean {
  const byId = new Map(items.map((item) => [item.id, item]));
  const moved = proposal.moves.some((move) => {
    const item = byId.get(move.id);
    return (
      !item ||
      item.x !== move.from.x ||
      item.z !== move.from.z ||
      item.rotation !== move.from.rotation
    );
  });
  if (moved) return true;
  const targets = new Set(proposal.moves.map((move) => move.id));
  const after = applyProposal(items, proposal).map((item) => ({
    id: item.id,
    rect: itemRect(item),
  }));
  return after.some(
    (target) =>
      targets.has(target.id) &&
      after.some((other) => other.id !== target.id && rectsTooClose(target.rect, other.rect)),
  );
}

export function applyProposal(
  items: readonly PlacedItem[],
  proposal: Proposal,
): readonly PlacedItem[] {
  const moves = new Map(proposal.moves.map((move) => [move.id, move.to]));
  return items.map((item) => {
    const to = moves.get(item.id);
    return to ? { ...item, ...to } : item;
  });
}
