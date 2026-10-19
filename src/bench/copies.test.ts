import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildCopies, disposeModel, frameCamera, gridOffsets, setEnvironmentMap } from './copies';

function sampleModel() {
  const body = new Mesh(new BoxGeometry(1, 2, 0.5), new MeshStandardMaterial());
  body.position.set(0, 1, 0);
  const handle = new Mesh(new BoxGeometry(0.1, 0.3, 0.1), new MeshBasicMaterial());
  handle.position.set(0.4, 1, 0.3);
  const root = new Group();
  root.add(body, handle);
  return { root, body, handle };
}

function instancesOf(root: Group): InstancedMesh[] {
  return root.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
}

describe('gridOffsets', () => {
  it('lays copies out on a square grid centred on the origin', () => {
    const offsets = gridOffsets(100, 2);
    expect(offsets).toHaveLength(100);
    const xs = offsets.map(([x]) => x);
    const zs = offsets.map(([, z]) => z);
    expect(Math.min(...xs)).toBe(-9);
    expect(Math.max(...xs)).toBe(9);
    expect(Math.min(...zs)).toBe(-9);
    expect(Math.max(...zs)).toBe(9);
    expect(new Set(offsets.map(([x, z]) => `${x},${z}`)).size).toBe(100);
  });

  it('puts a single copy at the origin', () => {
    expect(gridOffsets(1, 5)).toEqual([[0, 0]]);
  });
});

describe('buildCopies', () => {
  it('creates one InstancedMesh per source mesh that shares geometry and material', () => {
    const { root, body, handle } = sampleModel();

    const model = buildCopies(root, 100, true);

    const instanced = instancesOf(model.root);
    expect(instanced).toHaveLength(2);
    expect(instanced.map((mesh) => mesh.count)).toEqual([100, 100]);
    expect(instanced[0]?.geometry).toBe(body.geometry);
    expect(instanced[0]?.material).toBe(body.material);
    expect(instanced[1]?.geometry).toBe(handle.geometry);
  });

  it('places every instance at its grid offset times the mesh world matrix', () => {
    const { root, handle } = sampleModel();
    root.position.set(0, 0.5, 0);

    const model = buildCopies(root, 4, true);

    const spacing = 1 * 1.6;
    const matrix = new Matrix4();
    instancesOf(model.root)[1]?.getMatrixAt(3, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(0.4 + spacing / 2);
    expect(position.y).toBeCloseTo(1.5);
    expect(position.z).toBeCloseTo(0.3 + spacing / 2);
    expect(handle.parent).toBe(root);
  });

  it('expands source instancing so each copy keeps every original instance', () => {
    const repeated = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
    const root = new Group().add(repeated);

    const model = buildCopies(root, 100, true);

    expect(instancesOf(model.root)[0]?.count).toBe(300);
  });

  it('scales glass thickness by the placement scale, which three.js ignores for instances', () => {
    const glass = new MeshPhysicalMaterial({ transmission: 1, thickness: 2 });
    const quantised = new Mesh(new BoxGeometry(), glass);
    quantised.scale.setScalar(0.5);
    const plain = new Mesh(new BoxGeometry(), glass);
    const model = buildCopies(new Group().add(quantised, plain), 4, true);

    const [scaled, unscaled] = instancesOf(model.root).map((mesh) => mesh.material);
    expect(scaled).toBeInstanceOf(MeshPhysicalMaterial);
    expect(scaled).not.toBe(glass);
    expect(scaled).toMatchObject({ thickness: 1 });
    expect(unscaled).toBe(glass);
    const disposeScaled = vi.spyOn(MeshPhysicalMaterial.prototype, 'dispose');

    disposeModel(model);

    expect(disposeScaled).toHaveBeenCalledTimes(2);
    expect(glass.thickness).toBe(2);
  });

  it('clones the whole scene per copy when instancing is off, sharing GPU resources', () => {
    const { root, body, handle } = sampleModel();

    const model = buildCopies(root, 100, false);

    const geometries = new Set<unknown>();
    let meshes = 0;
    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshes += 1;
      geometries.add(object.geometry);
    });
    expect(model.root.children).toHaveLength(100);
    expect(instancesOf(model.root)).toHaveLength(0);
    expect(meshes).toBe(200);
    expect([...geometries]).toEqual([body.geometry, handle.geometry]);
  });
});

describe('setEnvironmentMap and disposeModel', () => {
  it('lights standard materials with the environment and frees everything but it', () => {
    const { root, body } = sampleModel();
    const albedo = new Texture();
    const material = body.material;
    material.map = albedo;
    const environment = new Texture();
    const model = buildCopies(root, 4, true);
    const scene = new Group().add(model.root);
    const disposeGeometry = vi.spyOn(body.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeAlbedo = vi.spyOn(albedo, 'dispose');
    const disposeEnvironment = vi.spyOn(environment, 'dispose');
    const disposeInstances = instancesOf(model.root).map((mesh) => vi.spyOn(mesh, 'dispose'));

    setEnvironmentMap(root, environment);
    disposeModel(model);

    expect(material.envMap).toBe(environment);
    expect(scene.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
    expect(disposeAlbedo).toHaveBeenCalled();
    expect(disposeEnvironment).not.toHaveBeenCalled();
    for (const dispose of disposeInstances) expect(dispose).toHaveBeenCalled();
  });
});

describe('frameCamera', () => {
  it('keeps every corner of the bounds inside the view', () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const box = new Box3(new Vector3(-8, 0, -8), new Vector3(8, 2.2, 8));

    frameCamera(camera, box);
    camera.updateMatrixWorld();

    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
          expect(projected.z).toBeLessThan(1);
          expect(projected.z).toBeGreaterThan(-1);
        }
      }
    }
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.position.distanceTo(new Vector3(0, 1.1, 0)));
  });
});
