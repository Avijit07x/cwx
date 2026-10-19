import { execFileSync } from 'node:child_process';
import { Node, Primitive, type Document, type Transform } from '@gltf-transform/core';
import type { InstancedMesh } from '@gltf-transform/extensions';
import { compactPrimitive, createTransform, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const NORMAL_WEIGHT = 0.2;
const DIRECTION_STEPS = 127;
const SHIFT_DELTA_E = 5;
const MAX_SHIFTED_SHARE = 0.1;
const KTX2 = 'image/ktx2';
const DECODE_BUFFER_BYTES = 2 ** 28;

export function hoistInstanceScale(): Transform {
  return createTransform('hoistInstanceScale', (document) => {
    for (const node of document.getRoot().listNodes()) {
      const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
      const translation = batch?.getAttribute('TRANSLATION');
      const translations = translation?.getArray();
      const scales = batch?.getAttribute('SCALE')?.getArray();
      const factor = scales?.[0];
      if (
        !batch ||
        !translation ||
        !(translations instanceof Float32Array) ||
        !(scales instanceof Float32Array) ||
        !factor ||
        node.listChildren().length > 0 ||
        scales.some((value) => value !== factor)
      ) {
        continue;
      }
      const [x, y, z] = node.getScale();
      node.setScale([x * factor, y * factor, z * factor]);
      batch
        .setAttribute(
          'TRANSLATION',
          translation.clone().setArray(translations.map((value) => value / factor)),
        )
        .setAttribute('SCALE', null);
    }
  });
}

export function pruneBatches(): Transform {
  return createTransform('pruneBatches', (document) => {
    const instancing = document
      .getRoot()
      .listExtensionsUsed()
      .find((extension) => extension.extensionName === 'EXT_mesh_gpu_instancing');
    for (const batch of instancing?.listProperties() ?? []) {
      if (!batch.listParents().some((parent) => parent instanceof Node)) batch.dispose();
    }
  });
}

function snap(value: number): number {
  const snapped = Math.round(value * DIRECTION_STEPS) / DIRECTION_STEPS;
  return snapped === 0 ? 0 : snapped;
}

export function snapDirections(): Transform {
  return createTransform('snapDirections', (document) => {
    const primitives = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives());
    const accessors = new Set(
      primitives.flatMap((primitive) => [
        primitive.getAttribute('NORMAL'),
        primitive.getAttribute('TANGENT'),
      ]),
    );
    for (const accessor of accessors) {
      const array = accessor?.getArray();
      if (accessor && array instanceof Float32Array) accessor.setArray(array.map(snap));
    }
  });
}

export function largestExtent(min: readonly number[], max: readonly number[]): number {
  return Math.max(0, ...max.map((value, axis) => value - (min[axis] ?? value)));
}

function simplifyWithNormals(primitive: Primitive, maxError: number, modelSize: number): void {
  const position = primitive.getAttribute('POSITION');
  const positions = position?.getArray();
  const normals = primitive.getAttribute('NORMAL')?.getArray();
  const indices = primitive.getIndices();
  const indexArray = indices?.getArray();
  if (
    primitive.getMode() !== Primitive.Mode.TRIANGLES ||
    !position ||
    !(positions instanceof Float32Array) ||
    !(normals instanceof Float32Array) ||
    !indices ||
    !indexArray
  ) {
    return;
  }
  const meshSize = largestExtent(position.getMin([]), position.getMax([]));
  if (meshSize === 0) return;
  const weight = (NORMAL_WEIGHT * modelSize) / meshSize;
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    Uint32Array.from(indexArray),
    positions,
    3,
    normals,
    3,
    [weight, weight, weight],
    null,
    0,
    maxError,
    ['ErrorAbsolute'],
  );
  if (simplified.length === 0) {
    primitive.dispose();
    return;
  }
  primitive.setIndices(indices.clone().setArray(new Uint32Array(simplified)));
  compactPrimitive(primitive);
}

export function simplifyToModelError(error: number): Transform {
  return createTransform('simplifyToModelError', (document) => {
    const root = document.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    if (!scene) return;
    const { min, max } = getBounds(scene);
    const modelSize = largestExtent(min, max);
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        simplifyWithNormals(primitive, error * modelSize, modelSize);
      }
      if (mesh.listPrimitives().length === 0) mesh.dispose();
    }
  });
}

function linearChannel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

const LINEAR = Float64Array.from({ length: 256 }, (_, value) => linearChannel(value));

function labComponent(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116;
}

function lab(pixels: Uint8Array, index: number): readonly [number, number, number] {
  const red = LINEAR[pixels[index] ?? 0] ?? 0;
  const green = LINEAR[pixels[index + 1] ?? 0] ?? 0;
  const blue = LINEAR[pixels[index + 2] ?? 0] ?? 0;
  const x = labComponent((0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047);
  const y = labComponent(0.2126 * red + 0.7152 * green + 0.0722 * blue);
  const z = labComponent((0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function shiftedShare(reference: Uint8Array, candidate: Uint8Array): number {
  const texels = Math.floor(Math.min(reference.length, candidate.length) / 3);
  let shifted = 0;
  for (let index = 0; index < texels * 3; index += 3) {
    const [l1, a1, b1] = lab(reference, index);
    const [l2, a2, b2] = lab(candidate, index);
    if (Math.hypot(l1 - l2, a1 - a2, b1 - b2) > SHIFT_DELTA_E) shifted += 1;
  }
  return texels === 0 ? 0 : shifted / texels;
}

async function colourShift(source: Uint8Array, encoded: Uint8Array): Promise<number> {
  const decoded = execFileSync('ktx', ['extract', '--transcode', 'rgba8', '-', '-'], {
    input: encoded,
    maxBuffer: DECODE_BUFFER_BYTES,
  });
  const { data, info } = await sharp(decoded)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const reference = await sharp(source)
    .resize(info.width, info.height, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer();
  return shiftedShare(reference, data);
}

export async function revertColourShifts(document: Document, encode: Transform): Promise<void> {
  const textures = document.getRoot().listTextures();
  const sources = textures.map((texture) => ({
    texture,
    image: texture.getImage(),
    mimeType: texture.getMimeType(),
  }));
  await document.transform(encode);
  const results: string[] = [];
  for (const { texture, image, mimeType } of sources) {
    const encoded = texture.getImage();
    if (!image || !encoded || mimeType === KTX2 || texture.getMimeType() !== KTX2) continue;
    const share = await colourShift(image, encoded);
    const reverted = share > MAX_SHIFTED_SHARE;
    if (reverted) texture.setImage(image).setMimeType(mimeType);
    const label = `texture ${textures.indexOf(texture) + 1} ${(share * 100).toFixed(1)} %`;
    results.push(reverted ? `${label} (re-encoded)` : label);
  }
  console.log(
    `  Texels beyond ΔE ${SHIFT_DELTA_E} after ETC1S (limit ${MAX_SHIFTED_SHARE * 100} %): ` +
      results.join(', '),
  );
}
