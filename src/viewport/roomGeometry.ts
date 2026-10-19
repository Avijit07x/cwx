import { BoxGeometry, BufferAttribute, BufferGeometry, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR } from '../domain/grid';
import type { Point } from '../domain/types';
import { COLORS } from './colors';

export type GridWeight = 'minor' | 'mid' | 'major';

interface GridLine {
  readonly axis: 'x' | 'z';
  readonly value: number;
  readonly weight: GridWeight;
}

const MAJOR_STEP = 5;
const MID_STEP = 1;
const WEIGHT_ORDER: Readonly<Record<GridWeight, number>> = { minor: 0, mid: 1, major: 2 };
const WEIGHT_COLOR: Readonly<Record<GridWeight, string>> = {
  minor: COLORS.gridMinor,
  mid: COLORS.gridMid,
  major: COLORS.gridMajor,
};

export function gridWeight(value: number): GridWeight {
  if (value % MAJOR_STEP === 0) return 'major';
  if (value % MID_STEP === 0) return 'mid';
  return 'minor';
}

function axisLines(axis: GridLine['axis'], extent: number, cell: number): GridLine[] {
  return Array.from({ length: Math.round(extent / cell) + 1 }, (_, index) => {
    const value = index * cell;
    return { axis, value, weight: gridWeight(value) };
  });
}

export function gridLines(
  width: number = FLOOR.width,
  depth: number = FLOOR.depth,
  cell: number = FLOOR.cell,
): GridLine[] {
  return [...axisLines('x', width, cell), ...axisLines('z', depth, cell)].sort(
    (a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight],
  );
}

export function buildGridGeometry(lines: readonly GridLine[] = gridLines()): BufferGeometry {
  const positions = new Float32Array(lines.length * 6);
  const colors = new Float32Array(lines.length * 6);
  const color = new Color();
  lines.forEach((line, index) => {
    const offset = index * 6;
    const segment =
      line.axis === 'x'
        ? [line.value, 0, 0, line.value, 0, FLOOR.depth]
        : [0, 0, line.value, FLOOR.width, 0, line.value];
    positions.set(segment, offset);
    color.set(WEIGHT_COLOR[line.weight]);
    colors.set([color.r, color.g, color.b, color.r, color.g, color.b], offset);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

const CURB_THICKNESS = 0.12;
const CURB_HEIGHT = 0.14;

export function buildCurbGeometry(): BufferGeometry {
  const { width, depth } = FLOOR;
  const t = CURB_THICKNESS;
  const h = CURB_HEIGHT;
  const parts = [
    new BoxGeometry(width + 2 * t, h, t).translate(width / 2, h / 2, -t / 2),
    new BoxGeometry(width + 2 * t, h, t).translate(width / 2, h / 2, depth + t / 2),
    new BoxGeometry(t, h, depth).translate(-t / 2, h / 2, depth / 2),
    new BoxGeometry(t, h, depth).translate(width + t / 2, h / 2, depth / 2),
  ];
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

export const NORTH_MARKER_CENTRE: Point = { x: FLOOR.width / 2, z: -0.95 };

type Local = readonly [number, number];
type Quad = readonly [Local, Local, Local, Local];

const NORTH_SHAPES: readonly Quad[] = [
  [
    [0, 0.55],
    [-0.3, -0.05],
    [0, 0.1],
    [0.3, -0.05],
  ],
  [
    [-0.16, -0.6],
    [-0.09, -0.6],
    [-0.09, -0.15],
    [-0.16, -0.15],
  ],
  [
    [0.09, -0.6],
    [0.16, -0.6],
    [0.16, -0.15],
    [0.09, -0.15],
  ],
  [
    [-0.16, -0.15],
    [-0.09, -0.15],
    [0.16, -0.6],
    [0.09, -0.6],
  ],
];

export function northMarkerTriangles(centre: Point = NORTH_MARKER_CENTRE, y = 0.002): number[] {
  const toWorld = ([east, north]: Local) => [centre.x + east, y, centre.z - north];
  return NORTH_SHAPES.flatMap(([a, b, c, d]) => [a, b, c, a, c, d].flatMap(toWorld));
}

export function buildNorthMarkerGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(northMarkerTriangles()), 3),
  );
  return geometry;
}
