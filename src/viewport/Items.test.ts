import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { instanceCapacity, tintColors, tintOf, writeInstances } from './Items';

const tints = tintColors('#2357d9');

function instancePosition(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

function instanceFront(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3(0, 0, 1).transformDirection(matrix);
}

function instanceColor(mesh: InstancedMesh, index: number): string {
  const color = new Color();
  mesh.getColorAt(index, color);
  return color.getHexString();
}

describe('writeInstances', () => {
  const plain = makeItem({ kind: 'cabinet', x: 2.5, z: 3.25, rotation: 90 });
  const selected = makeItem({ kind: 'cabinet', x: 6, z: 3.25 });
  const crowded = makeItem({ kind: 'cabinet', x: 9, z: 8.25, rotation: 180 });

  it('places, turns and tints one instance per item', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 2, 0.5), new MeshBasicMaterial(), 16);
    writeInstances(mesh, [plain, selected, crowded], selected.id, new Set([crowded.id]), tints);

    expect(mesh.count).toBe(3);
    expect(instancePosition(mesh, 0).toArray()).toEqual([2.5, 0, 3.25]);
    expect(instancePosition(mesh, 2).toArray()).toEqual([9, 0, 8.25]);
    expect(instanceFront(mesh, 0).x).toBeCloseTo(-1);
    expect(instanceFront(mesh, 2).z).toBeCloseTo(-1);
    expect(instanceColor(mesh, 0)).toBe(tints.idle.getHexString());
    expect(instanceColor(mesh, 1)).toBe(tints.selected.getHexString());
    expect(instanceColor(mesh, 2)).toBe(tints.violating.getHexString());
    expect(mesh.boundingSphere?.center.x).toBeGreaterThan(2);
  });

  it('shrinks the drawn count when items go away', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 2, 0.5), new MeshBasicMaterial(), 16);
    writeInstances(mesh, [plain, selected, crowded], null, new Set(), tints);
    writeInstances(mesh, [plain], null, new Set(), tints);
    expect(mesh.count).toBe(1);
  });
});

describe('tintOf', () => {
  it('lets a clearance violation win over the selection tint', () => {
    const { id } = makeItem();
    expect(tintOf(id, id, new Set([id]))).toBe('violating');
    expect(tintOf(id, id, new Set())).toBe('selected');
    expect(tintOf(id, null, new Set())).toBe('idle');
  });
});

describe('tintColors', () => {
  it('derives the selected tint from the accent, so a host theme recolours it', () => {
    for (const accent of ['#2357d9', '#0b6aa2']) {
      const base = new Color(accent).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
      const tint = tintColors(accent).selected.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
      expect(tint.h).toBeCloseTo(base.h, 5);
      expect(tint.l).toBeGreaterThan(base.l + 0.2);
    }
    expect(tintColors('#0b6aa2').selected.equals(tints.selected)).toBe(false);
  });
});

describe('instanceCapacity', () => {
  it('grows in powers of two from 16', () => {
    expect(instanceCapacity(0)).toBe(16);
    expect(instanceCapacity(16)).toBe(16);
    expect(instanceCapacity(17)).toBe(32);
    expect(instanceCapacity(500)).toBe(512);
  });
});
