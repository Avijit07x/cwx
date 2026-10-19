import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { beginDrag, updateDrag } from '../../state/actions';
import { resetEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { mockListLayout } from '../../test/listLayout';
import { RuleCheckPanel } from './RuleCheckPanel';

const described = vi.hoisted(() => ({ calls: 0 }));

vi.mock('../../i18n/describe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../i18n/describe')>();
  return {
    ...actual,
    describeViolation: (...args: Parameters<typeof actual.describeViolation>) => {
      described.calls += 1;
      return actual.describeViolation(...args);
    },
  };
});

beforeEach(() => {
  mockListLayout({ viewport: 400, row: 84 });
});

it('a drag step re-renders only the issue whose gap changed', () => {
  const moving = makeItem({ kind: 'drive', tag: 'VFD-04', x: 10.75, z: 6.25 });
  resetEditor([
    makeItem({ kind: 'drive', tag: 'VFD-01', x: 2.25, z: 2.25 }),
    makeItem({ kind: 'drive', tag: 'VFD-02', x: 2.75, z: 2.25 }),
    makeItem({ kind: 'drive', tag: 'VFD-03', x: 10.25, z: 6.25 }),
    moving,
  ]);
  render(<RuleCheckPanel />);
  const issues = () => within(screen.getByRole('list', { name: 'Clearance issues' }));
  expect(issues().getAllByRole('listitem')).toHaveLength(2);
  described.calls = 0;

  act(() => {
    beginDrag(moving.id);
    updateDrag({ x: 11.25, z: 6.25 });
  });

  expect(issues().getAllByRole('listitem')[1]).toHaveTextContent(
    'VFD-03 and VFD-04 are 0.50 m apart',
  );
  expect(described.calls).toBe(1);
});
