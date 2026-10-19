import {
  ImageUtils,
  type Document,
  type GLTF,
  type Node,
  type Primitive,
  type Texture,
} from '@gltf-transform/core';
import { EXTMeshGPUInstancing, InstancedMesh } from '@gltf-transform/extensions';
import { getGLPrimitiveCount, listTextureSlots } from '@gltf-transform/functions';

export interface TextureStats {
  readonly name: string;
  readonly slots: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly bytes: number;
  readonly gpuBytes: number;
}

export interface ModelStats {
  readonly meshes: number;
  readonly primitives: number;
  readonly materials: number;
  readonly drawCalls: number;
  readonly instancedDrawCalls: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly textures: readonly TextureStats[];
  readonly textureBytes: number;
  readonly textureGpuBytes: number;
  readonly extensions: readonly string[];
}

const GL_TRIANGLES = 4;
const GL_TRIANGLE_STRIP = 5;
const GL_TRIANGLE_FAN = 6;
const TRIANGLE_MODES: ReadonlySet<GLTF.MeshPrimitiveMode> = new Set([
  GL_TRIANGLES,
  GL_TRIANGLE_STRIP,
  GL_TRIANGLE_FAN,
]);

const MIME_FORMATS: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
};

const MIPMAP_CHAIN_FACTOR = 4 / 3;
const UNCOMPRESSED_BITS_PER_PIXEL = 32;
const UASTC_BITS_PER_PIXEL = 8;
const KTX2_HEADER_BYTES = 48;
const BASIS_LZ_SCHEME = 1;

type Ktx2Codec = 'ETC1S' | 'UASTC';

export function ktx2Codec(image: Uint8Array): Ktx2Codec | null {
  if (image.byteLength < KTX2_HEADER_BYTES) return null;
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const vkFormat = view.getUint32(12, true);
  if (vkFormat !== 0) return null;
  return view.getUint32(44, true) === BASIS_LZ_SCHEME ? 'ETC1S' : 'UASTC';
}

export function estimateGpuBytes(width: number, height: number, bitsPerPixel: number): number {
  return Math.round(((width * height * bitsPerPixel) / 8) * MIPMAP_CHAIN_FACTOR);
}

function triangleCount(primitive: Primitive): number {
  return TRIANGLE_MODES.has(primitive.getMode()) ? getGLPrimitiveCount(primitive) : 0;
}

function instancesOf(node: Node): number | null {
  const extension = node.getExtension(EXTMeshGPUInstancing.EXTENSION_NAME);
  if (!(extension instanceof InstancedMesh)) return null;
  return extension.listAttributes()[0]?.getCount() ?? 0;
}

function bitsPerPixel(codec: Ktx2Codec | null, image: Uint8Array): number {
  if (codec === 'UASTC') return UASTC_BITS_PER_PIXEL;
  if (codec === 'ETC1S') return (ImageUtils.getChannels(image, 'image/ktx2') ?? 4) > 3 ? 8 : 4;
  return UNCOMPRESSED_BITS_PER_PIXEL;
}

function describeTexture(texture: Texture, index: number): TextureStats {
  const image = texture.getImage() ?? new Uint8Array();
  const mimeType = texture.getMimeType();
  const [width, height] = texture.getSize() ?? [0, 0];
  const codec = mimeType === 'image/ktx2' ? ktx2Codec(image) : null;
  return {
    name: texture.getName() || texture.getURI() || `texture ${index + 1}`,
    slots: listTextureSlots(texture),
    width,
    height,
    format: codec ? `KTX2 ${codec}` : (MIME_FORMATS[mimeType] ?? mimeType),
    bytes: image.byteLength,
    gpuBytes: estimateGpuBytes(width, height, bitsPerPixel(codec, image)),
  };
}

export function collectStats(document: Document): ModelStats {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let drawCalls = 0;
  let instancedDrawCalls = 0;
  let triangles = 0;
  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const instances = instancesOf(node);
    for (const primitive of mesh.listPrimitives()) {
      drawCalls += 1;
      if (instances !== null) instancedDrawCalls += 1;
      triangles += triangleCount(primitive) * (instances ?? 1);
    }
  });
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const textures = root.listTextures().map(describeTexture);
  return {
    meshes: root.listMeshes().length,
    primitives: primitives.length,
    materials: root.listMaterials().length,
    drawCalls,
    instancedDrawCalls,
    triangles,
    vertices: primitives.reduce(
      (sum, primitive) => sum + (primitive.getAttribute('POSITION')?.getCount() ?? 0),
      0,
    ),
    textures,
    textureBytes: textures.reduce((sum, texture) => sum + texture.bytes, 0),
    textureGpuBytes: textures.reduce((sum, texture) => sum + texture.gpuBytes, 0),
    extensions: root.listExtensionsUsed().map((extension) => extension.extensionName),
  };
}
