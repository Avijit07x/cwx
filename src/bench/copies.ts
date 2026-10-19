import {
  Box3,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Sphere,
  Texture,
  Vector3,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from 'three';

export interface LoadedModel {
  readonly root: Group;
  readonly source: Object3D;
}

const SPACING_FACTOR = 1.6;
const FRAMING_MARGIN = 1.05;
const VIEW_DIRECTION = new Vector3(1, 0.7, 1.2).normalize();

export function gridOffsets(count: number, spacing: number): (readonly [number, number])[] {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index): readonly [number, number] => [
    ((index % columns) - (columns - 1) / 2) * spacing,
    (Math.floor(index / columns) - (rows - 1) / 2) * spacing,
  ]);
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function listMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (isMesh(object)) meshes.push(object);
  });
  return meshes;
}

function listMaterials(root: Object3D): Material[] {
  return listMeshes(root).flatMap((mesh) => [mesh.material].flat());
}

export function setEnvironmentMap(root: Object3D, texture: Texture): void {
  for (const material of listMaterials(root)) {
    if (material instanceof MeshStandardMaterial) material.envMap = texture;
  }
}

function worldMatrices(mesh: Mesh): Matrix4[] {
  if (!(mesh instanceof InstancedMesh)) return [mesh.matrixWorld.clone()];
  return Array.from({ length: mesh.count }, (_, index) => {
    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix.premultiply(mesh.matrixWorld);
  });
}

function withPlacementThickness(
  material: Material | Material[],
  placement: Matrix4 | undefined,
): Material | Material[] {
  const scale = placement?.getMaxScaleOnAxis() ?? 1;
  if (!(material instanceof MeshPhysicalMaterial) || material.thickness === 0 || scale === 1) {
    return material;
  }
  const scaled = material.clone();
  scaled.thickness *= scale;
  return scaled;
}

function instanceAcrossGrid(
  mesh: Mesh,
  offsets: readonly (readonly [number, number])[],
): InstancedMesh {
  const placements = worldMatrices(mesh);
  const instanced = new InstancedMesh(
    mesh.geometry,
    withPlacementThickness(mesh.material, placements[0]),
    offsets.length * placements.length,
  );
  const offset = new Matrix4();
  const matrix = new Matrix4();
  let index = 0;
  for (const [x, z] of offsets) {
    offset.makeTranslation(x, 0, z);
    for (const placement of placements) {
      instanced.setMatrixAt(index, matrix.multiplyMatrices(offset, placement));
      index += 1;
    }
  }
  instanced.name = mesh.name;
  instanced.computeBoundingSphere();
  return instanced;
}

export function buildCopies(source: Object3D, count: number, instancing: boolean): LoadedModel {
  source.updateMatrixWorld(true);
  const size = new Box3().setFromObject(source).getSize(new Vector3());
  const offsets = gridOffsets(count, Math.max(size.x, size.z) * SPACING_FACTOR);
  const root = new Group();
  if (instancing) {
    for (const mesh of listMeshes(source)) root.add(instanceAcrossGrid(mesh, offsets));
  } else {
    for (const [x, z] of offsets) {
      const copy = source.clone();
      copy.position.x += x;
      copy.position.z += z;
      root.add(copy);
    }
  }
  return { root, source };
}

export function frameCamera(camera: PerspectiveCamera, box: Box3): void {
  const sphere = box.getBoundingSphere(new Sphere());
  const verticalHalfFov = MathUtils.degToRad(camera.fov) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const distance =
    (sphere.radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))) * FRAMING_MARGIN;
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
  camera.near = distance / 100;
  camera.far = distance * 4;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
}

function disposeMaterial(material: Material): void {
  const entries: [string, unknown][] = Object.entries(material);
  for (const [key, value] of entries) {
    if (key === 'envMap' || !(value instanceof Texture)) continue;
    const image: unknown = value.image;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
    value.dispose();
  }
  material.dispose();
}

export function disposeModel(model: LoadedModel): void {
  model.root.removeFromParent();
  model.root.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
  });
  const sourceMaterials = new Set(listMaterials(model.source));
  for (const material of new Set(listMaterials(model.root))) {
    if (!sourceMaterials.has(material)) material.dispose();
  }
  for (const mesh of listMeshes(model.source)) mesh.geometry.dispose();
  for (const material of sourceMaterials) disposeMaterial(material);
}
