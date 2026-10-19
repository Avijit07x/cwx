import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATALOG } from '../domain/catalog';
import type { ItemKind, Rotation } from '../domain/types';
import { COLORS, KIND_COLORS } from './colors';

type Vec2 = readonly [number, number];
type Triple = readonly [number, number, number];

const PLINTH_HEIGHT = 0.1;
const PLINTH_INSET = 0.02;
const FRONT_RECESS = 0.02;
const SLAT_HEIGHT = 0.014;
const SLAT_DEPTH = 0.006;
const UPWARD = 0.9;
const CYLINDER_SEGMENTS = 28;

export function yaw(rotation: Rotation): number {
  return -(rotation * Math.PI) / 180;
}

function paint(geometry: BufferGeometry, side: string, top: string): BufferGeometry {
  const normals = geometry.getAttribute('normal');
  const sideColor = new Color(side);
  const topColor = new Color(top);
  const colors = new Float32Array(normals.count * 3);
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const color = normals.getY(vertex) > UPWARD ? topColor : sideColor;
    colors.set([color.r, color.g, color.b], vertex * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function box(size: Triple, centre: Triple, color: string, top: string = color): BufferGeometry {
  const [width, height, depth] = size;
  const [x, y, z] = centre;
  return paint(new BoxGeometry(width, height, depth).translate(x, y, z), color, top);
}

function cylinder(
  radius: number,
  height: number,
  centre: Triple,
  color: string,
  top: string = color,
): BufferGeometry {
  const [x, y, z] = centre;
  const geometry = new CylinderGeometry(radius, radius, height, CYLINDER_SEGMENTS);
  return paint(geometry.translate(x, y, z), color, top);
}

function enclosure(kind: ItemKind): BufferGeometry[] {
  const { width, depth, height } = CATALOG[kind];
  const bodyHeight = height - PLINTH_HEIGHT;
  return [
    box(
      [width - 2 * PLINTH_INSET, PLINTH_HEIGHT, depth - 2 * PLINTH_INSET],
      [0, PLINTH_HEIGHT / 2, 0],
      COLORS.plinth,
    ),
    box(
      [width, bodyHeight, depth - FRONT_RECESS],
      [0, PLINTH_HEIGHT + bodyHeight / 2, -FRONT_RECESS / 2],
      COLORS.enclosure,
      KIND_COLORS[kind],
    ),
  ];
}

function front(
  kind: ItemKind,
  size: Vec2,
  protrusion: number,
  at: Vec2,
  color: string,
): BufferGeometry {
  const face = CATALOG[kind].depth / 2 - FRONT_RECESS;
  return box([size[0], size[1], protrusion], [at[0], at[1], face + protrusion / 2], color);
}

function slats(
  kind: ItemKind,
  count: number,
  width: number,
  x: number,
  fromY: number,
  step: number,
): BufferGeometry[] {
  return Array.from({ length: count }, (_, index) =>
    front(kind, [width, SLAT_HEIGHT], SLAT_DEPTH, [x, fromY + index * step], COLORS.trim),
  );
}

function cabinet(): BufferGeometry[] {
  const doorBottom = PLINTH_HEIGHT + 0.04;
  const doorHeight = CATALOG.cabinet.height - 0.08 - doorBottom;
  return [
    ...enclosure('cabinet'),
    front(
      'cabinet',
      [0.008, doorHeight],
      SLAT_DEPTH,
      [0, doorBottom + doorHeight / 2],
      COLORS.trim,
    ),
    front('cabinet', [0.024, 0.2], FRONT_RECESS, [-0.05, 1.1], COLORS.trim),
    front('cabinet', [0.024, 0.2], FRONT_RECESS, [0.05, 1.1], COLORS.trim),
    ...slats('cabinet', 4, 0.3, -0.24, 0.24, 0.045),
    ...slats('cabinet', 4, 0.3, 0.24, 0.24, 0.045),
    front('cabinet', [0.18, 0.06], 0.004, [-0.24, 1.78], COLORS.steel),
    front('cabinet', [0.18, 0.06], 0.004, [0.24, 1.78], COLORS.steel),
  ];
}

function drive(): BufferGeometry[] {
  return [
    ...enclosure('drive'),
    front('drive', [0.22, 0.17], 0.01, [0, 1.38], COLORS.trim),
    front('drive', [0.16, 0.09], FRONT_RECESS, [0, 1.4], COLORS.screen),
    front('drive', [0.12, 0.04], 0.014, [0, 1.25], COLORS.plinth),
    ...slats('drive', 6, 0.3, 0, 0.26, 0.045),
    ...slats('drive', 3, 0.3, 0, 1.6, 0.045),
  ];
}

function transformer(): BufferGeometry[] {
  const { width, depth, height } = CATALOG.transformer;
  const accent = KIND_COLORS.transformer;
  const base = 0.08;
  const rail = 0.1;
  const railDepth = 0.14;
  const post = 0.08;
  const postHeight = height - base - rail;
  const coilHeight = 1.24;
  const coilY = base + 0.14 + coilHeight / 2;
  const yoke: Triple = [width - 0.2, 0.1, 0.2];
  const corners: readonly Vec2[] = [
    [width / 2 - post / 2, depth / 2 - post / 2],
    [-(width / 2 - post / 2), depth / 2 - post / 2],
    [width / 2 - post / 2, -(depth / 2 - post / 2)],
    [-(width / 2 - post / 2), -(depth / 2 - post / 2)],
  ];
  return [
    box([width, base, depth], [0, base / 2, 0], COLORS.frame),
    box(
      [width, rail, railDepth],
      [0, height - rail / 2, depth / 2 - railDepth / 2],
      COLORS.frame,
      accent,
    ),
    box(
      [width, rail, railDepth],
      [0, height - rail / 2, railDepth / 2 - depth / 2],
      COLORS.frame,
      accent,
    ),
    ...corners.map(([x, z]) =>
      box([post, postHeight, post], [x, base + postHeight / 2, z], COLORS.frame),
    ),
    box(yoke, [0, base + 0.07, 0], COLORS.steel),
    box(yoke, [0, coilY + coilHeight / 2 + 0.07, 0], COLORS.steel),
    ...[-0.5, 0, 0.5].map((x) => cylinder(0.21, coilHeight, [x, coilY, 0], accent)),
  ];
}

function ups(): BufferGeometry[] {
  return [
    ...enclosure('ups'),
    front('ups', [0.84, 0.66], 0.008, [0, 1.12], COLORS.plinth),
    front('ups', [0.3, 0.16], FRONT_RECESS, [-0.16, 1.24], COLORS.screen),
    front('ups', [0.05, 0.05], FRONT_RECESS, [0.14, 1.24], COLORS.led),
    front('ups', [0.05, 0.05], 0.016, [0.24, 1.24], COLORS.steel),
    ...slats('ups', 5, 0.7, 0, 0.26, 0.05),
  ];
}

const BUILDERS: Readonly<Record<ItemKind, () => BufferGeometry[]>> = {
  cabinet,
  drive,
  transformer,
  ups,
};

export function buildKindGeometry(kind: ItemKind): BufferGeometry {
  const parts = BUILDERS[kind]();
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const cache = new Map<ItemKind, BufferGeometry>();

export function kindGeometry(kind: ItemKind): BufferGeometry {
  const cached = cache.get(kind);
  if (cached) return cached;
  const geometry = buildKindGeometry(kind);
  cache.set(kind, geometry);
  return geometry;
}

export function releaseKindGeometries(): void {
  for (const geometry of cache.values()) geometry.dispose();
}
