import { Document, NodeIO, type Buffer, type GLTF, type Primitive } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, KHRTextureBasisu } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';
import { collectStats, estimateGpuBytes, ktx2Codec } from './stats.ts';

const GL_POINTS = 0;
const GL_TRIANGLES = 4;
const BASIS_LZ = 1;
const KHR_DF_MODEL_ETC1S = 163;
const ETC1S_RGB = 0;
const ETC1S_AAA = 15;
const DFD_OFFSET = 104;

function quad(
  document: Document,
  buffer: Buffer,
  mode: GLTF.MeshPrimitiveMode = GL_TRIANGLES,
): Primitive {
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer);
  return document
    .createPrimitive()
    .setMode(mode)
    .setAttribute('POSITION', position)
    .setIndices(indices);
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function ktx2(
  vkFormat: number,
  supercompression: number,
  channelTypes: readonly number[] = [ETC1S_RGB],
  size = 4,
): Uint8Array {
  const blockSize = 24 + 16 * channelTypes.length;
  const bytes = new Uint8Array(DFD_OFFSET + 4 + blockSize);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, vkFormat, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint32(44, supercompression, true);
  view.setUint32(48, DFD_OFFSET, true);
  view.setUint32(52, 4 + blockSize, true);
  view.setUint32(DFD_OFFSET, 4 + blockSize, true);
  view.setUint16(DFD_OFFSET + 10, blockSize, true);
  view.setUint8(DFD_OFFSET + 12, KHR_DF_MODEL_ETC1S);
  channelTypes.forEach((channelType, index) => {
    view.setUint8(DFD_OFFSET + 31 + 16 * index, channelType);
  });
  return bytes;
}

describe('collectStats', () => {
  it('counts one draw call per primitive per node and multiplies triangles by GPU instances', () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const single = document.createMesh('single').addPrimitive(quad(document, buffer));
    const pair = document
      .createMesh('pair')
      .addPrimitive(quad(document, buffer))
      .addPrimitive(quad(document, buffer));
    const instancing = document.createExtension(EXTMeshGPUInstancing).setRequired(true);
    const translations = document
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(9))
      .setBuffer(buffer);
    const batch = instancing.createInstancedMesh().setAttribute('TRANSLATION', translations);
    const parent = document.createNode('parent').setMesh(single);
    parent.addChild(document.createNode('child').setMesh(single));
    const instanced = document
      .createNode('instanced')
      .setMesh(pair)
      .setExtension('EXT_mesh_gpu_instancing', batch);
    document.createScene().addChild(parent).addChild(instanced);

    const stats = collectStats(document);

    expect(stats).toMatchObject({
      meshes: 2,
      primitives: 3,
      drawCalls: 4,
      instancedDrawCalls: 2,
      triangles: 2 + 2 + 3 * (2 + 2),
      vertices: 12,
      extensions: ['EXT_mesh_gpu_instancing'],
    });
  });

  it('ignores nodes outside the default scene and non-triangle primitives', () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const triangles = document.createMesh().addPrimitive(quad(document, buffer));
    const points = document.createMesh().addPrimitive(quad(document, buffer, GL_POINTS));
    const scene = document
      .createScene('default')
      .addChild(document.createNode().setMesh(triangles))
      .addChild(document.createNode().setMesh(points));
    document.createScene('unused').addChild(document.createNode().setMesh(triangles));
    document.getRoot().setDefaultScene(scene);

    const stats = collectStats(document);

    expect(stats.drawCalls).toBe(2);
    expect(stats.triangles).toBe(2);
    expect(stats.instancedDrawCalls).toBe(0);
  });

  it('reports texture size, format, slots and estimated GPU memory', () => {
    const document = new Document();
    const texture = document
      .createTexture('albedo')
      .setMimeType('image/png')
      .setImage(pngHeader(8, 4));
    document.createMaterial().setBaseColorTexture(texture);

    const stats = collectStats(document);

    expect(stats.materials).toBe(1);
    expect(stats.textures).toEqual([
      {
        name: 'albedo',
        slots: ['baseColorTexture'],
        width: 8,
        height: 4,
        format: 'PNG',
        bytes: 33,
        gpuBytes: 171,
      },
    ]);
    expect(stats.textureBytes).toBe(33);
    expect(stats.textureGpuBytes).toBe(171);
  });

  it('estimates ETC1S at 8 bits per pixel with an alpha channel and 4 without', () => {
    new NodeIO().registerExtensions([KHRTextureBasisu]);
    const document = new Document();
    const opaque = document
      .createTexture('opaque')
      .setMimeType('image/ktx2')
      .setImage(ktx2(0, BASIS_LZ, [ETC1S_RGB], 1024));
    const cutout = document
      .createTexture('cutout')
      .setMimeType('image/ktx2')
      .setImage(ktx2(0, BASIS_LZ, [ETC1S_RGB, ETC1S_AAA], 1024));
    document.createMaterial().setBaseColorTexture(opaque).setEmissiveTexture(cutout);

    const stats = collectStats(document);

    expect(
      stats.textures.map(({ name, format, gpuBytes }) => ({ name, format, gpuBytes })),
    ).toEqual([
      { name: 'opaque', format: 'KTX2 ETC1S', gpuBytes: 699_051 },
      { name: 'cutout', format: 'KTX2 ETC1S', gpuBytes: 1_398_101 },
    ]);
  });

  it('returns zeros for an empty document', () => {
    expect(collectStats(new Document())).toMatchObject({
      meshes: 0,
      drawCalls: 0,
      triangles: 0,
      textures: [],
      textureBytes: 0,
    });
  });
});

describe('ktx2Codec', () => {
  it('tells ETC1S (BasisLZ) from UASTC by the supercompression scheme', () => {
    expect(ktx2Codec(ktx2(0, BASIS_LZ))).toBe('ETC1S');
    expect(ktx2Codec(ktx2(0, 2))).toBe('UASTC');
    expect(ktx2Codec(ktx2(0, 0))).toBe('UASTC');
  });

  it('returns null for GPU-specific formats and truncated headers', () => {
    expect(ktx2Codec(ktx2(37, 0))).toBeNull();
    expect(ktx2Codec(new Uint8Array(20))).toBeNull();
  });
});

describe('estimateGpuBytes', () => {
  it('includes the mipmap chain', () => {
    expect(estimateGpuBytes(1024, 1024, 4)).toBe(699_051);
    expect(estimateGpuBytes(1024, 1024, 8)).toBe(1_398_101);
    expect(estimateGpuBytes(2048, 2048, 32)).toBe(22_369_621);
  });
});
