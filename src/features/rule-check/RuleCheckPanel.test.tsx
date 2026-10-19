import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { findViolations } from '../../domain/rules';
import { generateLayout, sampleLayout } from '../../domain/seed';
import type { ItemId } from '../../domain/types';
import { beginDrag, cancelDrag, moveItem, setLocale, updateDrag } from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { mockListLayout } from '../../test/listLayout';
import { RuleCheckPanel } from './RuleCheckPanel';

const ROW = 84;
const VIEWPORT = 4 * ROW;

function idOf(tag: string): ItemId {
  const item = useEditor.getState().items.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No item tagged ${tag}`);
  return item.id;
}

function issueList(): HTMLElement {
  return screen.getByRole('list', { name: 'Clearance issues' });
}

function issues(): HTMLElement[] {
  return within(issueList()).getAllByRole('listitem');
}

function positions(): (string | null)[] {
  return issues().map((issue) => issue.getAttribute('aria-posinset'));
}

function scrollIssues(top: number): void {
  const scroller = issueList().parentElement;
  if (!scroller) throw new Error('The issue list has no scroll container');
  act(() => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  resetEditor(sampleLayout());
  mockListLayout({ viewport: VIEWPORT, row: ROW });
});

describe('RuleCheckPanel', () => {
  it('states the rule and names both items of each violation', () => {
    render(<RuleCheckPanel />);
    expect(screen.getByText('Minimum clearance between items: 0.60 m')).toBeInTheDocument();
    expect(screen.getByText('1 issue')).toBeInTheDocument();
    expect(issues()).toHaveLength(1);
    expect(issues()[0]).toHaveTextContent('TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).');
  });

  it('selects an item, announces it and moves the 3D view to it from its tag button', async () => {
    const user = userEvent.setup();
    render(<RuleCheckPanel />);
    const tagButton = screen.getByRole('button', { name: 'UPS-01' });
    expect(tagButton.querySelector('svg')).toHaveAttribute('width', '14');
    await user.click(tagButton);

    const state = useEditor.getState();
    expect(state.selectedId).toBe(idOf('UPS-01'));
    expect(state.camera).toMatchObject({ seq: 1, focusId: idOf('UPS-01') });
    expect(state.announcement?.text).toMatch(/^Selected UPS-01, UPS unit/);
    expect(issues()[0]).toHaveAttribute('data-active');
  });

  it('explains a tag button in the shared tooltip on keyboard focus, not in a native title', async () => {
    const user = userEvent.setup();
    render(<RuleCheckPanel />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'TR-01' })).toHaveFocus();
    expect(await screen.findByText('Select TR-01 and show it in the 3D view')).toBeInTheDocument();
    expect(screen.queryByTitle(/show it in the 3D view/)).not.toBeInTheDocument();
  });

  it('shows a success state once every item meets the clearance', () => {
    render(<RuleCheckPanel />);
    act(() => {
      moveItem(idOf('UPS-01'), { x: 18, z: 2.5 });
    });
    expect(screen.getByText('No issues')).toBeInTheDocument();
    expect(screen.getByText('No clearance issues')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('updates live while an item is dragged', () => {
    render(<RuleCheckPanel />);
    act(() => {
      beginDrag(idOf('VFD-02'));
      updateDrag({ x: 3.75, z: 3.75 });
    });
    expect(screen.getByText('2 issues')).toBeInTheDocument();
    expect(issues()[0]).toHaveTextContent('VFD-01 and VFD-02 are 0.00 m apart (minimum 0.60 m).');

    act(() => {
      cancelDrag();
    });
    expect(screen.getByText('1 issue')).toBeInTheDocument();
  });

  it('describes overlapping items', () => {
    resetEditor([
      makeItem({ tag: 'A-1', x: 5.25, z: 5.25 }),
      makeItem({ tag: 'B-1', x: 5.25, z: 5.25 }),
    ]);
    render(<RuleCheckPanel />);
    expect(issues()[0]).toHaveTextContent('A-1 and B-1 overlap (minimum clearance 0.60 m).');
  });

  it('lists every issue of a long layout, rendering only the rows in view', () => {
    const layout = generateLayout(500);
    const total = findViolations(layout).length;
    expect(total).toBeGreaterThan(100);
    resetEditor(layout);
    render(<RuleCheckPanel />);

    const format = new Intl.NumberFormat('en-US');
    expect(screen.getByText(`${format.format(total)} issues`)).toBeInTheDocument();
    expect(screen.queryByText(/more issues/)).not.toBeInTheDocument();
    expect(issues().length).toBeGreaterThanOrEqual(4);
    expect(issues().length).toBeLessThan(20);
    expect(issues()[0]).toHaveAttribute('aria-posinset', '1');
    expect(issues()[0]).toHaveAttribute('aria-setsize', String(total));

    scrollIssues(total * ROW - VIEWPORT);
    expect(issues().length).toBeLessThan(20);
    expect(positions()).toContain(String(total));
    expect(positions()).not.toContain('1');
    expect(issues().at(-1)).toHaveTextContent(/are \d+\.\d{2} m apart|overlap/);
  });

  it('keeps a focused issue rendered while the list scrolls away from it', async () => {
    const layout = generateLayout(500);
    const total = findViolations(layout).length;
    resetEditor(layout);
    const user = userEvent.setup();
    render(<RuleCheckPanel />);

    await user.tab();
    const focused = document.activeElement;
    if (!(focused instanceof HTMLButtonElement)) throw new Error('No issue button has focus');
    expect(issues()[0]).toContainElement(focused);

    scrollIssues(total * ROW - VIEWPORT);
    expect(positions()).toContain('1');
    expect(positions()).toContain(String(total));
    expect(focused).toHaveFocus();

    act(() => {
      focused.blur();
    });
    expect(positions()).not.toContain('1');
  });

  it('is translated into Vietnamese', () => {
    act(() => {
      setLocale('vi');
    });
    render(<RuleCheckPanel />);
    expect(screen.getByText('1 vấn đề')).toBeInTheDocument();
    expect(screen.getByText('Khoảng cách tối thiểu giữa các thiết bị: 0,60 m')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Các vi phạm khoảng cách' })).getByRole('listitem'),
    ).toHaveTextContent('TR-01 và UPS-01 cách nhau 0,50 m (tối thiểu 0,60 m).');
  });
});
