import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { deriveBom } from './bom';
import { generateLayout } from './seed';
import type { ItemKind } from './types';

describe('deriveBom', () => {
  test('an empty layout has no lines and zero totals', () => {
    expect(deriveBom([])).toEqual({ lines: [], totalQuantity: 0, totalUsd: 0 });
  });

  test('counts each type with its part number, unit price and line total, in catalogue order', () => {
    const kinds: readonly ItemKind[] = ['drive', 'cabinet', 'drive', 'ups', 'cabinet', 'drive'];
    expect(deriveBom(kinds.map((kind) => makeItem({ kind })))).toEqual({
      lines: [
        {
          kind: 'cabinet',
          partNumber: 'LE-SWG-1005',
          quantity: 2,
          unitPriceUsd: 4800,
          totalUsd: 9600,
        },
        {
          kind: 'drive',
          partNumber: 'LE-VFD-0505',
          quantity: 3,
          unitPriceUsd: 3250,
          totalUsd: 9750,
        },
        { kind: 'ups', partNumber: 'LE-UPS-1010', quantity: 1, unitPriceUsd: 9900, totalUsd: 9900 },
      ],
      totalQuantity: 6,
      totalUsd: 29250,
    });
  });

  test('a single transformer is one line', () => {
    expect(deriveBom([makeItem({ kind: 'transformer' })]).lines).toEqual([
      {
        kind: 'transformer',
        partNumber: 'LE-TRF-1510',
        quantity: 1,
        unitPriceUsd: 18500,
        totalUsd: 18500,
      },
    ]);
  });

  test('the 500-item stress layout adds up to every item in the scene', () => {
    const bom = deriveBom(generateLayout(500));
    expect(bom.lines.map((line) => [line.kind, line.quantity, line.totalUsd])).toEqual([
      ['cabinet', 200, 960000],
      ['drive', 250, 812500],
      ['transformer', 20, 370000],
      ['ups', 30, 297000],
    ]);
    expect(bom.totalQuantity).toBe(500);
    expect(bom.totalUsd).toBe(2439500);
  });
});
