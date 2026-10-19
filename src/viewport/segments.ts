import { Shape, ShapeGeometry, Vector2, type BufferGeometry } from 'three';
import { CATALOG } from '../domain/catalog';
import { itemRect, rectAt } from '../domain/grid';
import type { Proposal } from '../domain/proposal';
import { itemsTooCloseTo, MIN_CLEARANCE, type Violation } from '../domain/rules';
import type { ItemId, ItemKind, PlacedItem, Point, Rect, Rotation } from '../domain/types';
import type { ItemIndex } from '../state/selectors';

export const OVERLAY_Y = {
  fill: 0.004,
  halo: 0.01,
  outline: 0.014,
  connector: 0.03,
  proposal: 0.05,
} as const;

const BOX_MARGIN = 0.02;
const HOVER_MARGIN = 0.03;
const ARC_SEGMENTS = 8;
const ARROW_LENGTH = 0.35;
const ARROW_SPREAD = Math.PI / 7;

function expandRect(rect: Rect, margin: number): Rect {
  return {
    minX: rect.minX - margin,
    minZ: rect.minZ - margin,
    maxX: rect.maxX + margin,
    maxZ: rect.maxZ + margin,
  };
}

function rectSegments(rect: Rect, y: number, out: number[] = []): number[] {
  const { minX, minZ, maxX, maxZ } = rect;
  out.push(minX, y, minZ, maxX, y, minZ);
  out.push(maxX, y, minZ, maxX, y, maxZ);
  out.push(maxX, y, maxZ, minX, y, maxZ);
  out.push(minX, y, maxZ, minX, y, minZ);
  return out;
}

export function boxEdgeSegments(rect: Rect, height: number, margin = BOX_MARGIN): number[] {
  const box = expandRect(rect, margin);
  const top = height + margin;
  const out = rectSegments(box, OVERLAY_Y.outline);
  rectSegments(box, top, out);
  const corners: readonly (readonly [number, number])[] = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
    [box.minX, box.maxZ],
  ];
  for (const [x, z] of corners) out.push(x, OVERLAY_Y.outline, z, x, top, z);
  return out;
}

export function hoverSegments(item: PlacedItem): Float32Array {
  return new Float32Array(
    rectSegments(expandRect(itemRect(item), HOVER_MARGIN), OVERLAY_Y.outline),
  );
}

export function selectionSegments(item: PlacedItem): Float32Array {
  return new Float32Array(boxEdgeSegments(itemRect(item), CATALOG[item.kind].height));
}

export function roundedRectPoints(rect: Rect, radius: number, segments = ARC_SEGMENTS): Point[] {
  const corners: readonly (readonly [number, number, number])[] = [
    [rect.maxX, rect.maxZ, 0],
    [rect.minX, rect.maxZ, Math.PI / 2],
    [rect.minX, rect.minZ, Math.PI],
    [rect.maxX, rect.minZ, (3 * Math.PI) / 2],
  ];
  return corners.flatMap(([cx, cz, start]) =>
    Array.from({ length: segments + 1 }, (_, step) => {
      const angle = start + (step / segments) * (Math.PI / 2);
      return { x: cx + radius * Math.cos(angle), z: cz + radius * Math.sin(angle) };
    }),
  );
}

function loopSegments(points: readonly Point[], y: number, out: number[] = []): number[] {
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    out.push(point.x, y, point.z, next.x, y, next.z);
  });
  return out;
}

export function haloSegments(rect: Rect, clearance: number = MIN_CLEARANCE): number[] {
  return loopSegments(roundedRectPoints(rect, clearance), OVERLAY_Y.halo);
}

export function haloFillGeometry(rect: Rect, clearance: number = MIN_CLEARANCE): BufferGeometry {
  const outline = roundedRectPoints(rect, clearance).map((point) => new Vector2(point.x, -point.z));
  return new ShapeGeometry(new Shape(outline))
    .rotateX(-Math.PI / 2)
    .translate(0, OVERLAY_Y.fill, 0);
}

function closestOnAxis(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): readonly [number, number] {
  if (aMax < bMin) return [aMax, bMin];
  if (bMax < aMin) return [aMin, bMax];
  const middle = (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
  return [middle, middle];
}

export function closestPoints(a: Rect, b: Rect): readonly [Point, Point] {
  const [ax, bx] = closestOnAxis(a.minX, a.maxX, b.minX, b.maxX);
  const [az, bz] = closestOnAxis(a.minZ, a.maxZ, b.minZ, b.maxZ);
  return [
    { x: ax, z: az },
    { x: bx, z: bz },
  ];
}

function connector(a: Rect, b: Rect, out: number[]): void {
  const [from, to] = closestPoints(a, b);
  if (from.x === to.x && from.z === to.z) return;
  out.push(from.x, OVERLAY_Y.connector, from.z, to.x, OVERLAY_Y.connector, to.z);
}

interface ViolationSegments {
  readonly outlines: Float32Array;
  readonly connectors: Float32Array;
}

export function violationSegments(
  violations: readonly Violation[],
  index: ItemIndex,
): ViolationSegments {
  const outlines: number[] = [];
  const connectors: number[] = [];
  const outlined = new Set<ItemId>();
  for (const violation of violations) {
    const a = index.get(violation.a);
    const b = index.get(violation.b);
    if (!a || !b) continue;
    for (const item of [a, b]) {
      if (outlined.has(item.id)) continue;
      outlined.add(item.id);
      rectSegments(itemRect(item), OVERLAY_Y.outline, outlines);
    }
    if (!violation.overlap) connector(itemRect(a), itemRect(b), connectors);
  }
  return { outlines: new Float32Array(outlines), connectors: new Float32Array(connectors) };
}

interface PlacementMarks {
  readonly rect: Rect;
  readonly valid: boolean;
  readonly outline: Float32Array;
  readonly halo: Float32Array;
}

export function placementMarks(
  kind: ItemKind,
  rotation: Rotation,
  at: Point,
  items: readonly PlacedItem[],
): PlacementMarks {
  const rect = rectAt(kind, rotation, at.x, at.z);
  const conflicts = itemsTooCloseTo(rect, items);
  const outline = rectSegments(rect, OVERLAY_Y.outline);
  for (const item of conflicts) connector(rect, itemRect(item), outline);
  return {
    rect,
    valid: conflicts.length === 0,
    outline: new Float32Array(outline),
    halo: new Float32Array(haloSegments(rect)),
  };
}

function arrow(from: Point, to: Point, y: number, out: number[]): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return;
  out.push(from.x, y, from.z, to.x, y, to.z);
  const back = Math.atan2(-dz, -dx);
  for (const side of [-1, 1]) {
    const angle = back + side * ARROW_SPREAD;
    const head = Math.min(ARROW_LENGTH, length / 2);
    out.push(to.x, y, to.z, to.x + head * Math.cos(angle), y, to.z + head * Math.sin(angle));
  }
}

export function proposalSegments(proposal: Proposal, index: ItemIndex): Float32Array {
  const out: number[] = [];
  for (const move of proposal.moves) {
    const item = index.get(move.id);
    if (!item) continue;
    rectSegments(itemRect(item), OVERLAY_Y.proposal, out);
    rectSegments(
      rectAt(item.kind, move.to.rotation, move.to.x, move.to.z),
      OVERLAY_Y.proposal,
      out,
    );
    arrow(item, move.to, OVERLAY_Y.proposal, out);
  }
  return new Float32Array(out);
}
