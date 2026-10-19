import { describe, expect, test } from 'vitest';
import { generateLayout, sampleLayout } from './seed';
import { LAYOUT_FORMAT_VERSION, parseLayout, serializeLayout } from './serialize';
import type { PlacedItem } from './types';

const VALID = { id: 'cab-1', kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25, rotation: 0 };

function layoutWith(...items: readonly unknown[]) {
  return { version: 1, items };
}

function roundTrip(items: readonly PlacedItem[]): readonly PlacedItem[] | null {
  const data: unknown = JSON.parse(serializeLayout(items));
  return parseLayout(data);
}

describe('serializeLayout and parseLayout', () => {
  test('round-trip layouts through JSON unchanged', () => {
    expect(roundTrip(sampleLayout())).toEqual(sampleLayout());
    expect(roundTrip(generateLayout(200, 4))).toEqual(generateLayout(200, 4));
    expect(roundTrip([])).toEqual([]);
  });

  test('write a versioned document', () => {
    expect(LAYOUT_FORMAT_VERSION).toBe(1);
    const data: unknown = JSON.parse(serializeLayout([]));
    expect(data).toEqual({ version: 1, items: [] });
  });

  test('parsing ignores unknown fields and trims tags', () => {
    expect(parseLayout(layoutWith({ ...VALID, tag: ' CAB-01 ', colour: 'red' }))).toEqual([
      { ...VALID, tag: 'CAB-01' },
    ]);
  });

  test('ids may be up to 64 characters', () => {
    expect(parseLayout(layoutWith({ ...VALID, id: 'x'.repeat(64) }))).toHaveLength(1);
  });
});

describe('parseLayout rejects malformed input', () => {
  test.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a JSON string that was never parsed', '{"version":1,"items":[]}'],
    ['a list', []],
    ['an object without a version', { items: [] }],
    ['another format version', { version: 2, items: [] }],
    ['a version given as text', { version: '1', items: [] }],
    ['a document without items', { version: 1 }],
    ['items that are not a list', { version: 1, items: {} }],
    ['an item that is not an object', layoutWith(null)],
    ['an item that is a list', layoutWith([VALID])],
    ['a missing id', layoutWith({ ...VALID, id: undefined })],
    ['an empty id', layoutWith({ ...VALID, id: '' })],
    ['an id over 64 characters', layoutWith({ ...VALID, id: 'x'.repeat(65) })],
    ['a numeric id', layoutWith({ ...VALID, id: 7 })],
    ['an unknown kind', layoutWith({ ...VALID, kind: 'generator' })],
    ['a rotation that is not a quarter turn', layoutWith({ ...VALID, rotation: 45 })],
    ['a rotation given as text', layoutWith({ ...VALID, rotation: '90' })],
    ['a tag that is not text', layoutWith({ ...VALID, tag: 12 })],
    ['a position given as text', layoutWith({ ...VALID, x: '3' })],
    ['a missing position', layoutWith({ ...VALID, z: undefined })],
    ['a NaN position', layoutWith({ ...VALID, x: Number.NaN })],
    ['an infinite position', layoutWith({ ...VALID, z: Number.POSITIVE_INFINITY })],
  ])('%s', (_name, input) => {
    expect(parseLayout(input)).toBeNull();
  });

  test.each<[string, readonly unknown[]]>([
    ['duplicate ids', [VALID, { ...VALID, tag: 'CAB-02', x: 5 }]],
    ['duplicate tags, ignoring case', [VALID, { ...VALID, id: 'cab-2', tag: 'cab-01', x: 5 }]],
    ['an item outside the room', [{ ...VALID, x: 19.75 }]],
    ['an item off the grid', [{ ...VALID, x: 3.25 }]],
    ['an empty tag', [{ ...VALID, tag: '   ' }]],
    ['a tag over 24 characters', [{ ...VALID, tag: 'X'.repeat(25) }]],
    ['one bad item among good ones', [VALID, { ...VALID, id: 'cab-2', tag: 'CAB-02', x: 3.3 }]],
  ])('a layout that breaks the rules: %s', (_name, items) => {
    expect(parseLayout(layoutWith(...items))).toBeNull();
  });
});
