import type { Object3D, WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const GLB_MAGIC = 0x46546c67;

export class MissingModelError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`Model file not found: ${url}`);
    this.name = 'MissingModelError';
    this.url = url;
  }
}

export function isGlb(buffer: ArrayBuffer): boolean {
  return buffer.byteLength >= 12 && new DataView(buffer).getUint32(0, true) === GLB_MAGIC;
}

export async function fetchGlb(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (response.status === 404) throw new MissingModelError(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  const buffer = await response.arrayBuffer();
  if (!isGlb(buffer)) throw new MissingModelError(url);
  return buffer;
}

interface ModelParser {
  readonly parse: (buffer: ArrayBuffer) => Promise<Object3D>;
  readonly dispose: () => void;
}

export function createModelParser(renderer: WebGLRenderer): ModelParser {
  const ktx2 = new KTX2Loader().detectSupport(renderer);
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return {
    parse: async (buffer) => (await gltf.parseAsync(buffer, '')).scene,
    dispose: () => {
      ktx2.dispose();
    },
  };
}
