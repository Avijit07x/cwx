import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { gridPositions } from './grid';
import {
  applyOps,
  normalizeTag,
  TAG_MAX_LENGTH,
  validateItem,
  type ApplyResult,
  type ItemChanges,
  type Op,
} from './ops';
import { generateLayout } from './seed';
import { ITEM_KINDS, ROTATIONS, toItemId, type PlacedItem } from './types';

const CAB = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const VFD = makeItem({ kind: 'drive', tag: 'VFD-01', x: 3.25, z: 3.75 });
const UPS = makeItem({ kind: 'ups', tag: 'UPS-01', x: 17.5, z: 2.5 });
const LAYOUT: readonly PlacedItem[] = [CAB, VFD, UPS];
const EXTRA = makeItem({ kind: 'drive', tag: 'VFD-02', x: 4.75, z: 3.75 });
const MISSING = toItemId('missing');

function applied(result: ApplyResult) {
  if (!result.ok) throw new Error(`Expected the ops to apply, got ${result.error.code}`);
  return result;
}

function rejected(result: ApplyResult) {
  if (result.ok) throw new Error('Expected the ops to be rejected');
  return result.error;
}

function tags(items: readonly PlacedItem[]): string[] {
  return items.map((item) => item.tag);
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

describe('validateItem', () => {
  test('accepts an item on the grid, inside the room, with a unique tag', () => {
    expect(validateItem(CAB, LAYOUT)).toBeNull();
  });

  test('rejects footprints that leave the room', () => {
    expect(validateItem({ ...VFD, x: 20.25 }, LAYOUT)).toEqual({
      code: 'out-of-bounds',
      id: VFD.id,
    });
    expect(validateItem({ ...CAB, rotation: 90, x: 3, z: 0 }, LAYOUT)).toEqual({
      code: 'out-of-bounds',
      id: CAB.id,
    });
  });

  test('rejects footprints whose edges are off the 0.5 m grid', () => {
    expect(validateItem({ ...VFD, x: 3.5 }, LAYOUT)).toEqual({ code: 'off-grid', id: VFD.id });
    expect(validateItem({ ...CAB, rotation: 90 }, LAYOUT)).toEqual({
      code: 'off-grid',
      id: CAB.id,
    });
  });

  test('rejects empty and over-long tags; 24 characters is the limit', () => {
    expect(TAG_MAX_LENGTH).toBe(24);
    expect(validateItem({ ...CAB, tag: '' }, LAYOUT)).toEqual({ code: 'empty-tag', id: CAB.id });
    expect(validateItem({ ...CAB, tag: 'X'.repeat(25) }, LAYOUT)).toEqual({
      code: 'tag-too-long',
      id: CAB.id,
    });
    expect(validateItem({ ...CAB, tag: 'X'.repeat(24) }, LAYOUT)).toBeNull();
  });

  test('rejects a tag used by another item, ignoring case, but not the item’s own tag', () => {
    expect(validateItem({ ...UPS, tag: 'cab-01' }, LAYOUT)).toEqual({
      code: 'duplicate-tag',
      id: UPS.id,
      tag: 'cab-01',
    });
    expect(validateItem({ ...CAB, tag: 'cab-01' }, LAYOUT)).toBeNull();
  });
});

describe('applyOps: add', () => {
  test('inserts the item at the requested index', () => {
    const { items, inverse } = applied(applyOps(LAYOUT, [{ type: 'add', item: EXTRA, index: 1 }]));
    expect(tags(items)).toEqual(['CAB-01', 'VFD-02', 'VFD-01', 'UPS-01']);
    expect(inverse).toEqual([{ type: 'remove', id: EXTRA.id }]);
  });

  test('clamps the index into the list', () => {
    const atStart = applied(applyOps(LAYOUT, [{ type: 'add', item: EXTRA, index: -5 }]));
    const atEnd = applied(applyOps(LAYOUT, [{ type: 'add', item: EXTRA, index: 99 }]));
    expect(tags(atStart.items)).toEqual(['VFD-02', 'CAB-01', 'VFD-01', 'UPS-01']);
    expect(tags(atEnd.items)).toEqual(['CAB-01', 'VFD-01', 'UPS-01', 'VFD-02']);
  });

  test('trims the tag before validating and storing it', () => {
    const padded = applied(
      applyOps(LAYOUT, [{ type: 'add', item: { ...EXTRA, tag: '  VFD-02 ' }, index: 3 }]),
    );
    expect(padded.items[3]?.tag).toBe('VFD-02');
    expect(
      rejected(applyOps(LAYOUT, [{ type: 'add', item: { ...EXTRA, tag: '   ' }, index: 3 }])),
    ).toEqual({
      code: 'empty-tag',
      id: EXTRA.id,
    });
  });

  test('rejects an id that is already in the layout', () => {
    expect(
      rejected(applyOps(LAYOUT, [{ type: 'add', item: { ...EXTRA, id: CAB.id }, index: 0 }])),
    ).toEqual({
      code: 'duplicate-id',
      id: CAB.id,
    });
  });

  test('rejects items that break the layout rules', () => {
    expect(
      rejected(applyOps(LAYOUT, [{ type: 'add', item: { ...EXTRA, tag: 'vfd-01' }, index: 0 }])),
    ).toEqual({
      code: 'duplicate-tag',
      id: EXTRA.id,
      tag: 'vfd-01',
    });
    expect(
      rejected(applyOps(LAYOUT, [{ type: 'add', item: { ...EXTRA, x: 30 }, index: 0 }])),
    ).toEqual({
      code: 'out-of-bounds',
      id: EXTRA.id,
    });
  });
});

describe('applyOps: remove', () => {
  test('removes the item; the inverse puts it back at the same index', () => {
    const result = applied(applyOps(LAYOUT, [{ type: 'remove', id: VFD.id }]));
    expect(result.items).toEqual([CAB, UPS]);
    expect(result.inverse).toEqual([{ type: 'add', item: VFD, index: 1 }]);
  });

  test('rejects an unknown id', () => {
    expect(rejected(applyOps(LAYOUT, [{ type: 'remove', id: MISSING }]))).toEqual({
      code: 'unknown-item',
      id: MISSING,
    });
  });
});

describe('applyOps: update', () => {
  test('changes only the given fields and records their previous values as the inverse', () => {
    const result = applied(
      applyOps(LAYOUT, [{ type: 'update', id: CAB.id, changes: { x: 5, tag: ' CAB-09 ' } }]),
    );
    expect(result.items[0]).toEqual({ ...CAB, x: 5, tag: 'CAB-09' });
    expect(result.items[1]).toBe(VFD);
    expect(result.inverse).toEqual([
      { type: 'update', id: CAB.id, changes: { x: 3, tag: 'CAB-01' } },
    ]);
  });

  test('returns the very same list when nothing changes', () => {
    const same = applied(
      applyOps(LAYOUT, [{ type: 'update', id: CAB.id, changes: { x: CAB.x, tag: ' CAB-01 ' } }]),
    );
    expect(same.items).toBe(LAYOUT);
    expect(applied(applyOps(LAYOUT, [])).items).toBe(LAYOUT);
  });

  test('rejects changes that break the layout rules', () => {
    const update = (changes: ItemChanges) =>
      rejected(applyOps(LAYOUT, [{ type: 'update', id: CAB.id, changes }]));
    expect(update({ x: 19.75 })).toEqual({ code: 'out-of-bounds', id: CAB.id });
    expect(update({ z: 1.5 })).toEqual({ code: 'off-grid', id: CAB.id });
    expect(update({ rotation: 90 })).toEqual({ code: 'off-grid', id: CAB.id });
    expect(update({ tag: 'ups-01' })).toEqual({ code: 'duplicate-tag', id: CAB.id, tag: 'ups-01' });
    expect(update({ tag: '   ' })).toEqual({ code: 'empty-tag', id: CAB.id });
    expect(update({ tag: 'X'.repeat(25) })).toEqual({ code: 'tag-too-long', id: CAB.id });
  });

  test('rejects an unknown id', () => {
    expect(
      rejected(applyOps(LAYOUT, [{ type: 'update', id: MISSING, changes: { x: 1 } }])),
    ).toEqual({
      code: 'unknown-item',
      id: MISSING,
    });
  });
});

describe('applyOps: tag spelling', () => {
  const add = (tag: string, items: readonly PlacedItem[] = LAYOUT, id = EXTRA.id) =>
    applyOps(items, [{ type: 'add', item: { ...EXTRA, id, tag }, index: items.length }]);
  const rename = (tag: string) =>
    applyOps(LAYOUT, [{ type: 'update', id: UPS.id, changes: { tag } }]);
  const storedTag = (result: ApplyResult) => applied(result).items.at(-1)?.tag;

  test('normalizeTag drops invisible and control characters, unifies look-alike forms and trims', () => {
    expect(normalizeTag('\u200BVFD-\u202E02\u0000')).toBe('VFD-02');
    expect(normalizeTag('\uFF36\uFF26\uFF24\uFF0D\uFF10\uFF12')).toBe('VFD-02');
    expect(normalizeTag('TU\u0309-01')).toBe('T\u1EE6-01');
    expect(normalizeTag(' UPS\u00A002\u3000')).toBe('UPS 02');
  });

  test('adding and renaming store the normalised tag', () => {
    expect(storedTag(add('\u200BVFD-\u202E02'))).toBe('VFD-02');
    expect(applied(rename('UPS\u00A002')).items[2]?.tag).toBe('UPS 02');
  });

  test('tags that look the same are duplicates', () => {
    expect(rejected(add('CAB-01\u200B'))).toEqual({
      code: 'duplicate-tag',
      id: EXTRA.id,
      tag: 'CAB-01',
    });
    expect(rejected(add('\uFF23\uFF21\uFF22-01'))).toMatchObject({ code: 'duplicate-tag' });
    expect(rejected(add('cab\u00AD-01'))).toMatchObject({ code: 'duplicate-tag' });
    expect(rejected(rename('VFD-01\u2060'))).toMatchObject({ code: 'duplicate-tag' });
    const withNfc = applied(add('T\u1EE6-01')).items;
    expect(rejected(add('TU\u0309-01', withNfc, toItemId('nfd')))).toEqual({
      code: 'duplicate-tag',
      id: toItemId('nfd'),
      tag: 'T\u1EE6-01',
    });
  });

  test('a tag made only of invisible characters is empty', () => {
    for (const tag of ['\u200B', '\u202E\u2066', '\u00AD', '\u0007']) {
      expect(rejected(add(tag))).toEqual({ code: 'empty-tag', id: EXTRA.id });
    }
    expect(rejected(rename('\u200B\u200C'))).toEqual({ code: 'empty-tag', id: UPS.id });
  });

  test('the length limit counts the stored spelling, so decomposed Vietnamese is not counted twice', () => {
    const tag = '\u1EE6'.repeat(TAG_MAX_LENGTH);
    expect(storedTag(add(tag.normalize('NFD')))).toBe(tag);
  });
});

describe('applyOps: batches', () => {
  test('apply all ops or none: one failing op rejects the batch and leaves the input untouched', () => {
    const snapshot = structuredClone(LAYOUT);
    const result = applyOps(LAYOUT, [
      { type: 'update', id: CAB.id, changes: { x: 5 } },
      { type: 'remove', id: VFD.id },
      { type: 'update', id: UPS.id, changes: { tag: 'CAB-01' } },
    ]);
    expect(rejected(result)).toEqual({ code: 'duplicate-tag', id: UPS.id, tag: 'CAB-01' });
    expect(LAYOUT).toEqual(snapshot);
  });

  test('report the first failing op', () => {
    const result = applyOps(LAYOUT, [
      { type: 'remove', id: MISSING },
      { type: 'update', id: CAB.id, changes: { x: 99 } },
    ]);
    expect(rejected(result)).toEqual({ code: 'unknown-item', id: MISSING });
  });

  test('later ops see the effect of earlier ops in the same batch', () => {
    const result = applied(
      applyOps(LAYOUT, [
        { type: 'remove', id: CAB.id },
        { type: 'update', id: UPS.id, changes: { tag: 'CAB-01' } },
        { type: 'add', item: { ...CAB, id: toItemId('new-cab'), tag: 'UPS-01' }, index: 0 },
      ]),
    );
    expect(tags(result.items)).toEqual(['UPS-01', 'VFD-01', 'CAB-01']);
  });
});

describe('applyOps: inverse', () => {
  const NEW = { ...EXTRA, id: toItemId('new-drive'), tag: 'VFD-07' };

  test.each<[string, readonly Op[]]>([
    ['an add', [{ type: 'add', item: EXTRA, index: 1 }]],
    ['a remove', [{ type: 'remove', id: VFD.id }]],
    [
      'a move and rename',
      [{ type: 'update', id: CAB.id, changes: { x: 5, z: 2.25, tag: 'MAIN' } }],
    ],
    ['a rotation', [{ type: 'update', id: CAB.id, changes: { rotation: 90, x: 2.75, z: 1 } }]],
    [
      'a clear',
      [
        { type: 'remove', id: CAB.id },
        { type: 'remove', id: VFD.id },
        { type: 'remove', id: UPS.id },
      ],
    ],
    [
      'a mixed batch',
      [
        { type: 'remove', id: CAB.id },
        { type: 'update', id: UPS.id, changes: { x: 12, tag: 'CAB-01' } },
        { type: 'add', item: NEW, index: 0 },
        { type: 'update', id: NEW.id, changes: { z: 6.25 } },
      ],
    ],
  ])('undoes %s exactly, order included, and the ops redo it', (_name, ops) => {
    const forward = applied(applyOps(LAYOUT, ops));
    const back = applied(applyOps(forward.items, forward.inverse));
    expect(back.items).toEqual(LAYOUT);
    expect(applied(applyOps(back.items, ops)).items).toEqual(forward.items);
  });

  test('random batches either apply and invert exactly, or are rejected without side effects', () => {
    const random = mulberry32(2024);
    const pick = <T>(values: readonly T[]): T => {
      const value = values[Math.floor(random() * values.length)];
      if (value === undefined) throw new Error('Cannot pick from an empty list');
      return value;
    };
    let items: readonly PlacedItem[] = generateLayout(30, 3);
    let applies = 0;
    let rejections = 0;

    const randomOp = (round: number, index: number): Op => {
      const roll = random();
      const existing = items.length > 0 && random() < 0.9 ? pick(items).id : MISSING;
      if (roll < 0.3) {
        const kind = pick(ITEM_KINDS);
        const rotation = pick(ROTATIONS);
        const spot = pick(gridPositions(kind, rotation));
        const tag = random() < 0.2 && items.length > 0 ? pick(items).tag : `R-${round}-${index}`;
        return {
          type: 'add',
          item: {
            id: toItemId(`random-${round}-${index}`),
            kind,
            rotation,
            tag,
            x: spot.x + (random() < 0.1 ? 0.25 : 0),
            z: spot.z,
          },
          index: Math.floor(random() * (items.length + 2)) - 1,
        };
      }
      if (roll < 0.5) return { type: 'remove', id: existing };
      return {
        type: 'update',
        id: existing,
        changes: {
          ...(random() < 0.5 ? { x: 0.25 + Math.floor(random() * 79) * 0.25 } : {}),
          ...(random() < 0.5 ? { z: 0.25 + Math.floor(random() * 47) * 0.25 } : {}),
          ...(random() < 0.3 ? { rotation: pick(ROTATIONS) } : {}),
          ...(random() < 0.3
            ? { tag: items.length > 0 && random() < 0.3 ? pick(items).tag : `U-${round}` }
            : {}),
        },
      };
    };

    for (let round = 0; round < 400; round++) {
      const before = items;
      const snapshot = structuredClone(before);
      const ops = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, index) =>
        randomOp(round, index),
      );
      const result = applyOps(before, ops);
      expect(before).toEqual(snapshot);
      if (!result.ok) {
        rejections += 1;
        continue;
      }
      applies += 1;
      expect(applied(applyOps(result.items, result.inverse)).items).toEqual(before);
      items = result.items;
    }
    expect(applies).toBeGreaterThan(50);
    expect(rejections).toBeGreaterThan(50);
  });
});
