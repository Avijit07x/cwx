import { Color, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../domain/catalog';
import { ITEM_KINDS, type ItemKind } from '../domain/types';
import { buildKindGeometry, kindGeometry, releaseKindGeometries, yaw } from './geometry';
import { COLORS, KIND_COLORS } from './colors';

interface Vertex {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly color: Color;
}

function vertexList(geometry: BufferGeometry): Vertex[] {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  return Array.from({ length: position.count }, (_, index) => ({
    position: new Vector3(position.getX(index), position.getY(index), position.getZ(index)),
    normal: new Vector3(normal.getX(index), normal.getY(index), normal.getZ(index)),
    color: new Color(color.getX(index), color.getY(index), color.getZ(index)),
  }));
}

const ENCLOSURES: readonly ItemKind[] = ['cabinet', 'drive', 'ups'];

describe('kind geometry', () => {
  it.each(ITEM_KINDS)('%s has exactly its catalogue size, standing on the floor', (kind) => {
    const { width, depth, height } = CATALOG[kind];
    const geometry = buildKindGeometry(kind);
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    expect(box?.min.x).toBeCloseTo(-width / 2, 6);
    expect(box?.max.x).toBeCloseTo(width / 2, 6);
    expect(box?.min.y).toBeCloseTo(0, 6);
    expect(box?.max.y).toBeCloseTo(height, 6);
    expect(box?.min.z).toBeCloseTo(-depth / 2, 6);
    expect(box?.max.z).toBeCloseTo(depth / 2, 6);
    geometry.dispose();
  });

  it.each(ITEM_KINDS)('%s is a single indexed, vertex-coloured buffer', (kind) => {
    const geometry = buildKindGeometry(kind);
    expect(geometry.index).not.toBeNull();
    expect(geometry.groups).toHaveLength(0);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.hasAttribute('uv')).toBe(false);
    geometry.dispose();
  });

  it.each(ITEM_KINDS)('%s shows its kind colour on top for the plan view', (kind) => {
    const geometry = buildKindGeometry(kind);
    const roof = vertexList(geometry).filter(
      (vertex) =>
        vertex.normal.y > 0.9 && Math.abs(vertex.position.y - CATALOG[kind].height) < 1e-6,
    );
    expect(roof.length).toBeGreaterThan(0);
    const expected = new Color(KIND_COLORS[kind]).getHexString();
    expect(roof.every((vertex) => vertex.color.getHexString() === expected)).toBe(true);
    geometry.dispose();
  });

  it.each(ENCLOSURES)('%s has its door, display and vent details on the +z front', (kind) => {
    const half = CATALOG[kind].depth / 2;
    const geometry = buildKindGeometry(kind);
    const vertices = vertexList(geometry);
    const shell = new Set([
      new Color(COLORS.enclosure).getHexString(),
      new Color(KIND_COLORS[kind]).getHexString(),
    ]);
    const front = vertices.filter((vertex) => vertex.position.z > half - 1e-6);
    const back = vertices.filter((vertex) => vertex.position.z < -half + 1e-6);
    expect(front.length).toBeGreaterThan(0);
    expect(front.some((vertex) => shell.has(vertex.color.getHexString()))).toBe(false);
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((vertex) => shell.has(vertex.color.getHexString()))).toBe(true);
    geometry.dispose();
  });

  it('gives each type a different footprint or height', () => {
    const sizes = ITEM_KINDS.map((kind) => {
      const geometry = buildKindGeometry(kind);
      const size = geometry.boundingBox?.getSize(new Vector3()).toArray().join('×');
      geometry.dispose();
      return size;
    });
    expect(new Set(sizes).size).toBe(ITEM_KINDS.length);
  });
});

describe('geometry cache', () => {
  it('shares one geometry per type and frees its GPU buffers on release', () => {
    const cabinet = kindGeometry('cabinet');
    expect(kindGeometry('cabinet')).toBe(cabinet);
    expect(kindGeometry('drive')).not.toBe(cabinet);
    const disposed = vi.fn();
    cabinet.addEventListener('dispose', disposed);
    releaseKindGeometries();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(kindGeometry('cabinet')).toBe(cabinet);
  });
});

describe('yaw', () => {
  it('turns the front clockwise in plan view', () => {
    const front = new Vector3(0, 0, 1);
    const west = front.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw(90));
    expect(west.x).toBeCloseTo(-1);
    expect(west.z).toBeCloseTo(0);
    const north = front.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw(180));
    expect(north.z).toBeCloseTo(-1);
  });
});
