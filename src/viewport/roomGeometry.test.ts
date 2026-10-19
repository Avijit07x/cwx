import { describe, expect, it } from 'vitest';
import { FLOOR } from '../domain/grid';
import {
  buildCurbGeometry,
  buildGridGeometry,
  gridLines,
  gridWeight,
  NORTH_MARKER_CENTRE,
  northMarkerTriangles,
  type GridWeight,
} from './roomGeometry';

function vertices(values: ArrayLike<number>): { x: number; y: number; z: number }[] {
  const result: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    result.push({
      x: values[index] ?? NaN,
      y: values[index + 1] ?? NaN,
      z: values[index + 2] ?? NaN,
    });
  }
  return result;
}

describe('gridLines', () => {
  it('draws a line every 0.5 m across the 20 × 12 m room, edges included', () => {
    const lines = gridLines();
    const xs = lines.filter((line) => line.axis === 'x').map((line) => line.value);
    const zs = lines.filter((line) => line.axis === 'z').map((line) => line.value);
    expect(xs).toHaveLength(41);
    expect(zs).toHaveLength(25);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(FLOOR.width);
    expect(Math.max(...zs)).toBe(FLOOR.depth);
  });

  it('emphasises every metre and every fifth metre', () => {
    const count = (weight: GridWeight) =>
      gridLines().filter((line) => line.weight === weight).length;
    expect(count('major')).toBe(8);
    expect(count('mid')).toBe(26);
    expect(count('minor')).toBe(32);
    expect(gridWeight(15)).toBe('major');
    expect(gridWeight(7)).toBe('mid');
    expect(gridWeight(7.5)).toBe('minor');
  });

  it('lists minor lines first so the emphasised lines draw on top', () => {
    const order = gridLines().map((line) => line.weight);
    expect(order.indexOf('mid')).toBeGreaterThan(order.lastIndexOf('minor'));
    expect(order.indexOf('major')).toBeGreaterThan(order.lastIndexOf('mid'));
  });
});

describe('buildGridGeometry', () => {
  it('packs every grid line into one coloured line-segment buffer on the floor', () => {
    const geometry = buildGridGeometry();
    const points = vertices(geometry.getAttribute('position').array);
    expect(points).toHaveLength(66 * 2);
    expect(geometry.getAttribute('color').count).toBe(points.length);
    expect(points.every((point) => point.y === 0)).toBe(true);
    expect(Math.max(...points.map((point) => point.x))).toBe(FLOOR.width);
    expect(Math.max(...points.map((point) => point.z))).toBe(FLOOR.depth);
    geometry.dispose();
  });
});

describe('room outline and north marker', () => {
  it('keeps the curb outside the floor that items can use', () => {
    const geometry = buildCurbGeometry();
    const points = vertices(geometry.getAttribute('position').array);
    const inside = points.filter(
      (point) => point.x > 0 && point.x < FLOOR.width && point.z > 0 && point.z < FLOOR.depth,
    );
    expect(inside).toEqual([]);
    expect(Math.min(...points.map((point) => point.x))).toBeLessThan(0);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(FLOOR.depth);
    geometry.dispose();
  });

  it('places the north marker beyond the north wall, pointing to -z', () => {
    const points = vertices(northMarkerTriangles());
    expect(points.length % 3).toBe(0);
    expect(points.every((point) => point.z < 0)).toBe(true);
    const tip = points.reduce((best, point) => (point.z < best.z ? point : best));
    expect(tip.x).toBeCloseTo(NORTH_MARKER_CENTRE.x);
  });
});
