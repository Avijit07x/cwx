import { CATALOG } from './catalog';
import { ITEM_KINDS, type ItemKind, type PlacedItem } from './types';

export interface BomLine {
  readonly kind: ItemKind;
  readonly partNumber: string;
  readonly quantity: number;
  readonly unitPriceUsd: number;
  readonly totalUsd: number;
}

export interface Bom {
  readonly lines: readonly BomLine[];
  readonly totalQuantity: number;
  readonly totalUsd: number;
}

export function deriveBom(items: readonly PlacedItem[]): Bom {
  const counts = new Map<ItemKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const lines = ITEM_KINDS.flatMap((kind): BomLine[] => {
    const quantity = counts.get(kind) ?? 0;
    if (quantity === 0) return [];
    const { partNumber, unitPriceUsd } = CATALOG[kind];
    return [{ kind, partNumber, quantity, unitPriceUsd, totalUsd: quantity * unitPriceUsd }];
  });
  return {
    lines,
    totalQuantity: items.length,
    totalUsd: lines.reduce((sum, line) => sum + line.totalUsd, 0),
  };
}
