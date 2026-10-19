import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, MeshLambertMaterial, Object3D, type InstancedMesh, type Material } from 'three';
import { launchOptions } from '../config';
import { ITEM_KINDS, type ItemId, type ItemKind, type PlacedItem } from '../domain/types';
import {
  selectEffectiveItems,
  selectEffectiveItemsOfKind,
  selectViolatingIds,
} from '../state/selectors';
import { useEditor } from '../state/store';
import { COLORS, useAccentColor } from './colors';
import { kindGeometry, yaw } from './geometry';

const MIN_CAPACITY = 16;
const SELECTED_TINT_MIX = 0.58;
const IDLE_TINT = new Color(COLORS.idleTint);
const VIOLATING_TINT = new Color(COLORS.violatingTint);

type Tint = 'idle' | 'selected' | 'violating';
type TintColors = Readonly<Record<Tint, Color>>;

export function instanceCapacity(count: number): number {
  let capacity = MIN_CAPACITY;
  while (capacity < count) capacity *= 2;
  return capacity;
}

export function tintOf(
  id: ItemId,
  selectedId: ItemId | null,
  violating: ReadonlySet<ItemId>,
): Tint {
  if (violating.has(id)) return 'violating';
  return id === selectedId ? 'selected' : 'idle';
}

export function tintColors(accent: string): TintColors {
  const selected = new Color(accent)
    .convertLinearToSRGB()
    .lerp(IDLE_TINT, SELECTED_TINT_MIX)
    .convertSRGBToLinear();
  return { idle: IDLE_TINT, selected, violating: VIOLATING_TINT };
}

const placement = new Object3D();

export function writeInstances(
  mesh: InstancedMesh,
  items: readonly PlacedItem[],
  selectedId: ItemId | null,
  violating: ReadonlySet<ItemId>,
  tints: TintColors,
): void {
  items.forEach((item, index) => {
    placement.position.set(item.x, 0, item.z);
    placement.rotation.set(0, yaw(item.rotation), 0);
    placement.updateMatrix();
    mesh.setMatrixAt(index, placement.matrix);
    mesh.setColorAt(index, tints[tintOf(item.id, selectedId, violating)]);
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function useItemMaterial(color: Color): Material {
  const material = useMemo(() => new MeshLambertMaterial({ color, vertexColors: true }), [color]);
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );
  return material;
}

interface KindInstancesProps {
  readonly kind: ItemKind;
  readonly material: Material;
  readonly tints: TintColors;
}

function KindInstances({ kind, material, tints }: KindInstancesProps) {
  const items = useEditor((state) => selectEffectiveItemsOfKind(state, kind));
  const selectedId = useEditor((state) => state.selectedId);
  const violating = useEditor(selectViolatingIds);
  const invalidate = useThree((state) => state.invalidate);
  const meshRef = useRef<InstancedMesh>(null);
  const capacity = instanceCapacity(items.length);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    return () => {
      mesh?.dispose();
    };
  }, [capacity]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    writeInstances(mesh, items, selectedId, violating, tints);
    invalidate();
  }, [items, selectedId, violating, tints, capacity, invalidate]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[kindGeometry(kind), material, capacity]}
      visible={items.length > 0}
      dispose={null}
    />
  );
}

function InstancedItems({ tints }: { readonly tints: TintColors }) {
  const material = useItemMaterial(IDLE_TINT);
  return ITEM_KINDS.map((kind) => (
    <KindInstances key={kind} kind={kind} material={material} tints={tints} />
  ));
}

function ItemMeshes({ tints }: { readonly tints: TintColors }) {
  const items = useEditor(selectEffectiveItems);
  const selectedId = useEditor((state) => state.selectedId);
  const violating = useEditor(selectViolatingIds);
  const materials: Readonly<Record<Tint, Material>> = {
    idle: useItemMaterial(tints.idle),
    selected: useItemMaterial(tints.selected),
    violating: useItemMaterial(tints.violating),
  };
  return items.map((item) => (
    <mesh
      key={item.id}
      geometry={kindGeometry(item.kind)}
      material={materials[tintOf(item.id, selectedId, violating)]}
      position={[item.x, 0, item.z]}
      rotation-y={yaw(item.rotation)}
      dispose={null}
    />
  ));
}

export function Items() {
  const accent = useAccentColor();
  const tints = useMemo(() => tintColors(accent), [accent]);
  return launchOptions.instancing ? <InstancedItems tints={tints} /> : <ItemMeshes tints={tints} />;
}
