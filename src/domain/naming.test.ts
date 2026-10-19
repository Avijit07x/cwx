import { describe, expect, test } from 'vitest';
import { makeItem } from '../test/fixtures';
import { nextTag } from './naming';
import { TAG_MAX_LENGTH } from './ops';
import { ITEM_KINDS, type PlacedItem } from './types';

function withTags(...tags: readonly string[]): PlacedItem[] {
  return tags.map((tag) => makeItem({ tag }));
}

describe('nextTag', () => {
  test('starts every type at 01 with its prefix', () => {
    expect(ITEM_KINDS.map((kind) => nextTag(kind, []))).toEqual([
      'CAB-01',
      'VFD-01',
      'TR-01',
      'UPS-01',
    ]);
  });

  test('continues after the highest number in use, not after the count', () => {
    expect(nextTag('cabinet', withTags('CAB-01', 'CAB-07', 'CAB-03'))).toBe('CAB-08');
  });

  test('reads existing tags case-insensitively', () => {
    expect(nextTag('cabinet', withTags('cab-04'))).toBe('CAB-05');
  });

  test('ignores other prefixes and tags that are not exactly prefix-number', () => {
    const items = withTags('VFD-09', 'CAB-1A', 'XCAB-20', 'CAB-', 'CAB-03-B', 'CAB 04', 'TR-05');
    expect(nextTag('cabinet', items)).toBe('CAB-01');
    expect(nextTag('transformer', items)).toBe('TR-06');
    expect(nextTag('drive', items)).toBe('VFD-10');
  });

  test('pads to two digits and keeps counting past 99', () => {
    expect(nextTag('ups', withTags('UPS-9'))).toBe('UPS-10');
    expect(nextTag('ups', withTags('UPS-99'))).toBe('UPS-100');
  });

  test('placing items one after another never repeats a tag', () => {
    const items = withTags('cab-02', 'CAB-10', 'MAIN-01');
    for (let step = 0; step < 50; step++) {
      items.push(makeItem({ kind: 'cabinet', tag: nextTag('cabinet', items) }));
    }
    const used = items.map((item) => item.tag.toLowerCase());
    expect(new Set(used).size).toBe(used.length);
  });

  test('never repeats a tag when an existing tag number is beyond the safe integer range', () => {
    const items = withTags('CAB-9007199254740993');
    items.push(makeItem({ tag: nextTag('cabinet', items) }));
    const next = nextTag('cabinet', items);
    expect(items.map((item) => item.tag.toLowerCase())).not.toContain(next.toLowerCase());
  });

  test('the longest tag it can produce, after the largest safe number, fits the tag limit', () => {
    const longest = ITEM_KINDS.map((kind) => {
      const prefix = nextTag(kind, []).slice(0, -2);
      return nextTag(kind, withTags(`${prefix}${String(Number.MAX_SAFE_INTEGER)}`));
    });
    expect(longest).toEqual(
      ['CAB-', 'VFD-', 'TR-', 'UPS-'].map((prefix) => `${prefix}9007199254740992`),
    );
    expect(longest.filter((tag) => tag.length > TAG_MAX_LENGTH)).toEqual([]);
  });
});
