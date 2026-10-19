import { Box3, Vector2, Vector3, type Camera, type Ray, type Raycaster } from 'three';
import { CATALOG } from '../domain/catalog';
import { FLOOR, itemRect } from '../domain/grid';
import type { ItemId, PlacedItem, Point } from '../domain/types';

const DRAG_THRESHOLD_PX = 4;

const PARALLEL_EPSILON = 1e-9;
const STACKED_LAYOUT = '(max-width: 900px)';

const pointerNdc = new Vector2();

export interface ScreenPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export function pageScrollsOverView(): boolean {
  return window.matchMedia(STACKED_LAYOUT).matches;
}

export function rayFromPointer(
  raycaster: Raycaster,
  point: ScreenPoint,
  element: Element,
  camera: Camera,
): Ray {
  const rect = element.getBoundingClientRect();
  pointerNdc.set(
    ((point.clientX - rect.left) / rect.width) * 2 - 1,
    -((point.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster.ray;
}

export function intersectFloor(ray: Ray): Point | null {
  const { origin, direction } = ray;
  if (Math.abs(direction.y) < PARALLEL_EPSILON) return null;
  const distance = -origin.y / direction.y;
  if (distance < 0) return null;
  return { x: origin.x + direction.x * distance, z: origin.z + direction.z * distance };
}

interface ItemHit {
  readonly id: ItemId;
  readonly distance: number;
}

const bounds = new Box3();
const hitPoint = new Vector3();

export function pickItem(ray: Ray, items: readonly PlacedItem[]): ItemHit | null {
  let nearest: ItemHit | null = null;
  for (const item of items) {
    const rect = itemRect(item);
    bounds.min.set(rect.minX, 0, rect.minZ);
    bounds.max.set(rect.maxX, CATALOG[item.kind].height, rect.maxZ);
    if (!ray.intersectBox(bounds, hitPoint)) continue;
    const distance = hitPoint.distanceTo(ray.origin);
    if (!nearest || distance < nearest.distance) nearest = { id: item.id, distance };
  }
  return nearest;
}

export function exceedsDragThreshold(
  dx: number,
  dy: number,
  threshold = DRAG_THRESHOLD_PX,
): boolean {
  return dx * dx + dy * dy > threshold * threshold;
}

export function snapCursor(point: Point | null): Point | null {
  if (!point) return null;
  if (point.x < 0 || point.z < 0 || point.x > FLOOR.width || point.z > FLOOR.depth) return null;
  return {
    x: Math.round(point.x / FLOOR.cell) * FLOOR.cell,
    z: Math.round(point.z / FLOOR.cell) * FLOOR.cell,
  };
}
