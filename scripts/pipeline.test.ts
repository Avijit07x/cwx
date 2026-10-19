import { Document, type Mesh } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, type InstancedMesh } from '@gltf-transform/extensions';
import { instance, prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  hoistInstanceScale,
  largestExtent,
  pruneBatches,
  shiftedShare,
  simplifyToModelError,
  snapDirections,
} from './pipeline.ts';
import { collectStats } from './stats.ts';

const CELLS = 10;

function accessor(
  document: Document,
  type: 'VEC3' | 'SCALAR',
  array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  return document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

function plane(document: Document, bumpHeight: number): Mesh {
  const side = CELLS + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      const centre = row === CELLS / 2 && column === CELLS / 2;
      positions.push(column / CELLS, centre ? bumpHeight : 0, row / CELLS);
      normals.push(0, 1, 0);
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < CELLS; row++) {
    for (let column = 0; column < CELLS; column++) {
      const corner = row * side + column;
      indices.push(corner, corner + side, corner + 1, corner + 1, corner + side, corner + side + 1);
    }
  }
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', accessor(document, 'VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor(document, 'VEC3', new Float32Array(normals)))
    .setIndices(accessor(document, 'SCALAR', new Uint16Array(indices)));
  return document.createMesh().addPrimitive(primitive);
}

function sceneWith(document: Document, mesh: Mesh, copies: number): void {
  const scene = document.getRoot().getDefaultScene() ?? document.createScene();
  document.getRoot().setDefaultScene(scene);
  for (let copy = 0; copy < copies; copy++) {
    scene.addChild(
      document
        .createNode()
        .setMesh(mesh)
        .setTranslation([copy * 2, 0, 0]),
    );
  }
}

beforeAll(async () => {
  await MeshoptSimplifier.ready;
});

function instancedNode(document: Document, translations: number[], scales: number[]) {
  const batch = document
    .createExtension(EXTMeshGPUInstancing)
    .createInstancedMesh()
    .setAttribute('TRANSLATION', accessor(document, 'VEC3', new Float32Array(translations)))
    .setAttribute('SCALE', accessor(document, 'VEC3', new Float32Array(scales)));
  return document
    .createNode()
    .setMesh(plane(document, 0))
    .setTranslation([0, 1, 0])
    .setExtension('EXT_mesh_gpu_instancing', batch);
}

describe('hoistInstanceScale', () => {
  it('moves a shared uniform instance scale onto the node without moving any instance', async () => {
    const document = new Document();
    const uniform = instancedNode(document, [2, 0, 4, -2, 0, 6], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const mixed = instancedNode(document, [0, 0, 0, 1, 0, 0], [1, 1, 1, 2, 2, 2]);

    await document.transform(hoistInstanceScale());

    const batch = uniform.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
    expect(uniform.getScale()).toEqual([0.5, 0.5, 0.5]);
    expect(batch?.getAttribute('SCALE')).toBeNull();
    expect(Array.from(batch?.getAttribute('TRANSLATION')?.getArray() ?? [])).toEqual([
      4, 0, 8, -4, 0, 12,
    ]);
    expect(mixed.getScale()).toEqual([1, 1, 1]);
    expect(
      mixed.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing')?.getAttribute('SCALE'),
    ).not.toBeNull();
  });
});

describe('pruneBatches', () => {
  it('lets prune drop the instance data of batches that quantize replaced', async () => {
    const document = new Document();
    sceneWith(document, plane(document, 0), 3);
    await document.transform(instance({ min: 2 }), quantize());
    const accessors = document.getRoot().listAccessors().length;

    await document.transform(pruneBatches(), prune());

    expect(document.getRoot().listAccessors()).toHaveLength(accessors - 1);
    expect(collectStats(document)).toMatchObject({ drawCalls: 1, instancedDrawCalls: 1 });
  });
});

function twoTrianglesWithNoisySeam(document: Document): void {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, -0.00001, 1, 0, 0, 1, 0]);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', accessor(document, 'VEC3', positions))
    .setAttribute('NORMAL', accessor(document, 'VEC3', normals))
    .setIndices(accessor(document, 'SCALAR', new Uint16Array([0, 2, 1, 3, 4, 1])));
  sceneWith(document, document.createMesh().addPrimitive(primitive), 1);
}

describe('snapDirections', () => {
  it('lets weld merge vertices whose normals differ only by float noise', async () => {
    const welded = new Document();
    twoTrianglesWithNoisySeam(welded);
    const snapped = new Document();
    twoTrianglesWithNoisySeam(snapped);

    await welded.transform(weld());
    await snapped.transform(snapDirections(), weld());

    expect(collectStats(welded).vertices).toBe(5);
    expect(collectStats(snapped).vertices).toBe(4);
  });
});

describe('simplifyToModelError', () => {
  it('collapses a flat grid to two triangles', async () => {
    const document = new Document();
    sceneWith(document, plane(document, 0), 1);

    await document.transform(simplifyToModelError(0.001));

    expect(collectStats(document).triangles).toBe(2);
  });

  it('keeps a 1 cm bump under a 0.5 cm limit and removes it under a 2 cm limit', async () => {
    const keep = new Document();
    sceneWith(keep, plane(keep, 0.01), 1);
    const flatten = new Document();
    sceneWith(flatten, plane(flatten, 0.01), 1);

    await keep.transform(simplifyToModelError(0.005));
    await flatten.transform(simplifyToModelError(0.02));

    expect(collectStats(keep).triangles).toBeGreaterThan(2);
    expect(collectStats(flatten).triangles).toBe(2);
  });
});

describe('shiftedShare', () => {
  it('counts the texels whose colour moves by more than delta E 5', () => {
    const reference = new Uint8Array([40, 90, 84, 40, 90, 84, 200, 200, 200, 10, 10, 10]);
    const candidate = new Uint8Array([40, 90, 84, 40, 90, 120, 201, 200, 199, 10, 10, 10]);

    expect(shiftedShare(reference, candidate)).toBe(0.25);
    expect(shiftedShare(reference, reference)).toBe(0);
  });
});

describe('largestExtent', () => {
  it('returns the longest side of a bounding box', () => {
    expect(largestExtent([0, -1, 2], [0.5, 1, 2.25])).toBe(2);
    expect(largestExtent([], [])).toBe(0);
  });
});
