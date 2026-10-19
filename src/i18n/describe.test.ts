import { describe, expect, test } from 'vitest';
import type { EditLabel } from '../domain/history';
import type { EditError } from '../domain/ops';
import type { Violation } from '../domain/rules';
import { toItemId, type ItemId } from '../domain/types';
import { describeEdit, describeEditError, describeViolation } from './describe';
import { getTranslator } from './translate';

const en = getTranslator('en');
const vi = getTranslator('vi');
const CAB = toItemId('cab');
const VFD = toItemId('vfd');
const TAGS = new Map<ItemId, string>([
  [CAB, 'CAB-01'],
  [VFD, 'VFD-02'],
]);

function tagOf(id: ItemId): string {
  return TAGS.get(id) ?? '';
}

describe('describeEdit', () => {
  test.each<[string, EditLabel, string]>([
    ['Add CAB-01', { action: 'add', subject: 'CAB-01' }, 'Thêm CAB-01'],
    ['Delete CAB-01', { action: 'remove', subject: 'CAB-01' }, 'Xóa CAB-01'],
    ['Move CAB-01', { action: 'move', subject: 'CAB-01' }, 'Di chuyển CAB-01'],
    ['Rotate CAB-01', { action: 'rotate', subject: 'CAB-01' }, 'Xoay CAB-01'],
    ['Rename MAIN-01', { action: 'rename', subject: 'MAIN-01' }, 'Đổi tên MAIN-01'],
    ['Duplicate CAB-02', { action: 'duplicate', subject: 'CAB-02' }, 'Nhân bản CAB-02'],
    ['Paste CAB-03', { action: 'paste', subject: 'CAB-03' }, 'Dán CAB-03'],
    ['Clear layout', { action: 'clear', count: 12 }, 'Xóa toàn bộ bố trí'],
    [
      'Assistant change (1 move)',
      { action: 'assistant', count: 1 },
      'Thay đổi của trợ lý (1 lần di chuyển)',
    ],
    [
      'Assistant change (3 moves)',
      { action: 'assistant', count: 3 },
      'Thay đổi của trợ lý (3 lần di chuyển)',
    ],
  ])('describes "%s" in both languages', (english, label, vietnamese) => {
    expect(describeEdit(en, label)).toBe(english);
    expect(describeEdit(vi, label)).toBe(vietnamese);
  });
});

describe('describeEditError', () => {
  test.each<[string, EditError, string]>([
    [
      'That item no longer exists.',
      { code: 'unknown-item', id: CAB },
      'Thiết bị này không còn tồn tại.',
    ],
    ['That item already exists.', { code: 'duplicate-id', id: CAB }, 'Thiết bị này đã tồn tại.'],
    [
      'CAB-01 has to stay inside the room.',
      { code: 'out-of-bounds', id: CAB },
      'CAB-01 phải nằm trong phòng.',
    ],
    [
      'VFD-02 has to sit on the 0.5 m grid.',
      { code: 'off-grid', id: VFD },
      'VFD-02 phải nằm trên lưới 0,5 m.',
    ],
    ['Enter a tag.', { code: 'empty-tag', id: CAB }, 'Hãy nhập mã thiết bị.'],
    ['Use at most 24 characters.', { code: 'tag-too-long', id: CAB }, 'Tối đa 24 ký tự.'],
    [
      'VFD-02 is already used by another item.',
      { code: 'duplicate-tag', id: CAB, tag: 'VFD-02' },
      'Mã VFD-02 đã được dùng cho thiết bị khác.',
    ],
  ])('explains "%s" in both languages', (english, error, vietnamese) => {
    expect(describeEditError(en, error, tagOf)).toBe(english);
    expect(describeEditError(vi, error, tagOf)).toBe(vietnamese);
  });
});

describe('describeViolation', () => {
  const tooClose: Violation = { rule: 'clearance', a: CAB, b: VFD, gap: 0.5, overlap: false };

  test('names both items with the gap and the minimum', () => {
    expect(describeViolation(en, tooClose, tagOf)).toBe(
      'CAB-01 and VFD-02 are 0.50 m apart (minimum 0.60 m).',
    );
    expect(describeViolation(vi, tooClose, tagOf)).toBe(
      'CAB-01 và VFD-02 cách nhau 0,50 m (tối thiểu 0,60 m).',
    );
  });

  test('says when two items overlap', () => {
    const overlap: Violation = { ...tooClose, gap: 0, overlap: true };
    expect(describeViolation(en, overlap, tagOf)).toBe(
      'CAB-01 and VFD-02 overlap (minimum clearance 0.60 m).',
    );
    expect(describeViolation(vi, overlap, tagOf)).toBe(
      'CAB-01 và VFD-02 chồng lên nhau (khoảng cách tối thiểu 0,60 m).',
    );
  });

  test('rounds the gap to centimetres', () => {
    expect(describeViolation(en, { ...tooClose, gap: Math.hypot(0.3, 0.4) + 1e-12 }, tagOf)).toBe(
      'CAB-01 and VFD-02 are 0.50 m apart (minimum 0.60 m).',
    );
  });
});
