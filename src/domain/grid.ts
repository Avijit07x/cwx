import { CATALOG } from './catalog';
import type { ItemKind, PlacedItem, Point, Rect, Rotation } from './types';

export const FLOOR = { width: 20, depth: 12, cell: 0.5 } as const;

export const EPSILON = 1e-6;

interface Size {
  readonly w: number;
  readonly d: number;
}

export function footprint(kind: ItemKind, rotation: Rotation): Size {
  const { width, depth } = CATALOG[kind];
  return rotation === 90 || rotation === 270 ? { w: depth, d: width } : { w: width, d: depth };
}

export function rectAt(kind: ItemKind, rotation: Rotation, x: number, z: number): Rect {
  const { w, d } = footprint(kind, rotation);
  return { minX: x - w / 2, minZ: z - d / 2, maxX: x + w / 2, maxZ: z + d / 2 };
}

export function itemRect(item: PlacedItem): Rect {
  return rectAt(item.kind, item.rotation, item.x, item.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function placeEdge(edge: number, size: number, extent: number): number {
  return clamp(edge, 0, extent - size) + size / 2;
}

export function snapToGrid(kind: ItemKind, rotation: Rotation, x: number, z: number): Point {
  const { w, d } = footprint(kind, rotation);
  const snap = (centre: number, size: number) =>
    Math.round((centre - size / 2) / FLOOR.cell) * FLOOR.cell;
  return {
    x: placeEdge(snap(x, w), w, FLOOR.width),
    z: placeEdge(snap(z, d), d, FLOOR.depth),
  };
}

export function centreAfterRotation(
  item: Pick<PlacedItem, 'kind' | 'rotation' | 'x' | 'z'>,
  rotation: Rotation,
): Point {
  const { w, d } = footprint(item.kind, rotation);
  const before = rectAt(item.kind, item.rotation, item.x, item.z);
  const sideways = rotation === 90 || rotation === 270;
  const turnedEdge = (centre: number, size: number, min: number, max: number, extent: number) => {
    if (min < EPSILON) return 0;
    if (max > extent - EPSILON) return extent - size;
    const cells = (centre - size / 2) / FLOOR.cell;
    return (sideways ? Math.floor(cells + EPSILON) : Math.ceil(cells - EPSILON)) * FLOOR.cell;
  };
  return {
    x: placeEdge(turnedEdge(item.x, w, before.minX, before.maxX, FLOOR.width), w, FLOOR.width),
    z: placeEdge(turnedEdge(item.z, d, before.minZ, before.maxZ, FLOOR.depth), d, FLOOR.depth),
  };
}

export function isInsideRoom(rect: Rect): boolean {
  return (
    rect.minX >= -EPSILON &&
    rect.minZ >= -EPSILON &&
    rect.maxX <= FLOOR.width + EPSILON &&
    rect.maxZ <= FLOOR.depth + EPSILON
  );
}

function onGridLine(value: number): boolean {
  const cells = value / FLOOR.cell;
  return Math.abs(cells - Math.round(cells)) < EPSILON;
}

export function isOnGrid(rect: Rect): boolean {
  return onGridLine(rect.minX) && onGridLine(rect.minZ);
}

export function gridPositions(kind: ItemKind, rotation: Rotation): Point[] {
  const { w, d } = footprint(kind, rotation);
  const positions: Point[] = [];
  for (let z = d / 2; z <= FLOOR.depth - d / 2 + EPSILON; z += FLOOR.cell) {
    for (let x = w / 2; x <= FLOOR.width - w / 2 + EPSILON; x += FLOOR.cell) {
      positions.push({ x, z });
    }
  }
  return positions;
}
