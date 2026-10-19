import { CATALOG } from './catalog';
import { FLOOR, gridPositions, rectAt } from './grid';
import { ROTATIONS, toItemId, type ItemKind, type PlacedItem, type Rotation } from './types';

function item(
  id: string,
  kind: ItemKind,
  tag: string,
  x: number,
  z: number,
  rotation: Rotation = 0,
): PlacedItem {
  return { id: toItemId(id), kind, tag, x, z, rotation };
}

export function sampleLayout(): PlacedItem[] {
  return [
    item('sample-cab-01', 'cabinet', 'CAB-01', 3, 1.25),
    item('sample-cab-02', 'cabinet', 'CAB-02', 5, 1.25),
    item('sample-cab-03', 'cabinet', 'CAB-03', 7, 1.25),
    item('sample-cab-04', 'cabinet', 'CAB-04', 9, 1.25),
    item('sample-vfd-01', 'drive', 'VFD-01', 3.25, 3.75),
    item('sample-vfd-02', 'drive', 'VFD-02', 4.75, 3.75),
    item('sample-vfd-03', 'drive', 'VFD-03', 6.25, 3.75),
    item('sample-vfd-04', 'drive', 'VFD-04', 7.75, 3.75),
    item('sample-tr-01', 'transformer', 'TR-01', 15.75, 2.5),
    item('sample-ups-01', 'ups', 'UPS-01', 17.5, 2.5),
    item('sample-tr-02', 'transformer', 'TR-02', 4, 9.25, 90),
    item('sample-ups-02', 'ups', 'UPS-02', 12.5, 9.5),
  ];
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_MIX: readonly (readonly [ItemKind, number])[] = [
  ['transformer', 0.04],
  ['ups', 0.06],
  ['cabinet', 0.4],
  ['drive', 0.5],
];

const COLUMNS = FLOOR.width / FLOOR.cell;
const ROWS = FLOOR.depth / FLOOR.cell;

export function generateLayout(count: number, seed = 1): PlacedItem[] {
  const random = mulberry32(seed);
  const pick = <T>(values: readonly T[]): T | undefined =>
    values[Math.floor(random() * values.length)];
  const occupied = new Uint8Array(COLUMNS * ROWS);
  const cellsOf = (kind: ItemKind, rotation: Rotation, x: number, z: number) => {
    const rect = rectAt(kind, rotation, x, z);
    const cells: number[] = [];
    for (
      let row = Math.round(rect.minZ / FLOOR.cell);
      row < Math.round(rect.maxZ / FLOOR.cell);
      row++
    ) {
      for (
        let col = Math.round(rect.minX / FLOOR.cell);
        col < Math.round(rect.maxX / FLOOR.cell);
        col++
      ) {
        cells.push(row * COLUMNS + col);
      }
    }
    return cells;
  };
  const isFree = (cells: readonly number[]) => cells.every((cell) => occupied[cell] === 0);

  const items: PlacedItem[] = [];
  const counters = new Map<ItemKind, number>();
  let remaining = count;
  SEED_MIX.forEach(([kind, share], mixIndex) => {
    const quota = mixIndex === SEED_MIX.length - 1 ? remaining : Math.round(count * share);
    const n = Math.max(0, Math.min(quota, remaining));
    remaining -= n;
    for (let i = 0; i < n; i++) {
      const rotation = pick(ROTATIONS) ?? 0;
      const positions = gridPositions(kind, rotation);
      let spot = null;
      for (let attempt = 0; attempt < 40 && !spot; attempt++) {
        const candidate = pick(positions);
        if (candidate && isFree(cellsOf(kind, rotation, candidate.x, candidate.z)))
          spot = candidate;
      }
      spot ??=
        positions.find((p) => isFree(cellsOf(kind, rotation, p.x, p.z))) ?? pick(positions) ?? null;
      if (!spot) continue;
      for (const cell of cellsOf(kind, rotation, spot.x, spot.z)) occupied[cell] = 1;
      const number = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, number);
      const tag = `${CATALOG[kind].tagPrefix}-${String(number).padStart(2, '0')}`;
      items.push({ id: toItemId(`seed-${items.length + 1}`), kind, tag, rotation, ...spot });
    }
  });
  return items;
}
