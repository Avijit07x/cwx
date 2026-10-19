import { Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { exceedsDragThreshold, intersectFloor, pickItem, snapCursor } from './interaction';

function ray(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
) {
  return new Ray(new Vector3(...origin), new Vector3(...direction).normalize());
}

const down = (x: number, z: number) => ray([x, 20, z], [0, -1, 0]);

describe('intersectFloor', () => {
  it('finds where a downward ray meets the floor plane', () => {
    expect(intersectFloor(down(3.5, 2))).toEqual({ x: 3.5, z: 2 });
    const slanted = intersectFloor(ray([0, 4, 0], [1, -1, 0.5]));
    expect(slanted?.x).toBeCloseTo(4);
    expect(slanted?.z).toBeCloseTo(2);
  });

  it('returns null when the ray runs parallel to or away from the floor', () => {
    expect(intersectFloor(ray([0, 4, 0], [1, 0, 0]))).toBeNull();
    expect(intersectFloor(ray([0, 4, 0], [0, 1, 0]))).toBeNull();
  });
});

describe('pickItem', () => {
  const near = makeItem({ kind: 'cabinet', x: 5, z: 8.25 });
  const far = makeItem({ kind: 'cabinet', x: 5, z: 4.25 });

  it('returns the nearest item along the ray', () => {
    const towardsNorth = ray([5, 1, 20], [0, 0, -1]);
    expect(pickItem(towardsNorth, [far, near])?.id).toBe(near.id);
    expect(pickItem(towardsNorth, [near, far])?.id).toBe(near.id);
  });

  it('uses the catalogue height of each type', () => {
    const drive = makeItem({ kind: 'drive', x: 5.25, z: 5.25 });
    expect(pickItem(ray([5.25, 1.7, 20], [0, 0, -1]), [drive])?.id).toBe(drive.id);
    expect(pickItem(ray([5.25, 1.9, 20], [0, 0, -1]), [drive])).toBeNull();
  });

  it('uses the rotated footprint', () => {
    const turned = makeItem({ kind: 'cabinet', rotation: 90, x: 5.25, z: 5 });
    expect(pickItem(down(5.25, 5.4), [turned])?.id).toBe(turned.id);
    expect(pickItem(down(5.65, 5), [turned])).toBeNull();
  });

  it('misses on empty floor', () => {
    expect(pickItem(down(15, 10), [near, far])).toBeNull();
  });
});

describe('exceedsDragThreshold', () => {
  it('treats movement up to 4 px as a click', () => {
    expect(exceedsDragThreshold(3, 0)).toBe(false);
    expect(exceedsDragThreshold(0, -4)).toBe(false);
    expect(exceedsDragThreshold(5, 0)).toBe(true);
    expect(exceedsDragThreshold(3, 3)).toBe(true);
  });
});

describe('snapCursor', () => {
  it('rounds the floor point to the nearest grid intersection', () => {
    expect(snapCursor({ x: 3.3, z: 2.1 })).toEqual({ x: 3.5, z: 2 });
    expect(snapCursor({ x: 0, z: 12 })).toEqual({ x: 0, z: 12 });
  });

  it('returns null away from the floor', () => {
    expect(snapCursor({ x: -0.2, z: 3 })).toBeNull();
    expect(snapCursor({ x: 4, z: 12.3 })).toBeNull();
    expect(snapCursor(null)).toBeNull();
  });
});
