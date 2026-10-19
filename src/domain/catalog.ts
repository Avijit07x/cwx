import type { ItemKind } from './types';

interface ItemSpec {
  readonly kind: ItemKind;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly tagPrefix: string;
  readonly partNumber: string;
  readonly unitPriceUsd: number;
}

export const CATALOG: Readonly<Record<ItemKind, ItemSpec>> = {
  cabinet: {
    kind: 'cabinet',
    width: 1,
    depth: 0.5,
    height: 2,
    tagPrefix: 'CAB',
    partNumber: 'LE-SWG-1005',
    unitPriceUsd: 4800,
  },
  drive: {
    kind: 'drive',
    width: 0.5,
    depth: 0.5,
    height: 1.8,
    tagPrefix: 'VFD',
    partNumber: 'LE-VFD-0505',
    unitPriceUsd: 3250,
  },
  transformer: {
    kind: 'transformer',
    width: 1.5,
    depth: 1,
    height: 1.8,
    tagPrefix: 'TR',
    partNumber: 'LE-TRF-1510',
    unitPriceUsd: 18500,
  },
  ups: {
    kind: 'ups',
    width: 1,
    depth: 1,
    height: 1.6,
    tagPrefix: 'UPS',
    partNumber: 'LE-UPS-1010',
    unitPriceUsd: 9900,
  },
};
