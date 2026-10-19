import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLayout, sampleLayout } from '../../domain/seed';
import type { ItemId } from '../../domain/types';
import {
  beginDrag,
  hover,
  redo,
  select,
  setLocale,
  startPlacement,
  undo,
  updateDrag,
} from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { useKeyboardShortcuts } from '../shortcuts/useKeyboardShortcuts';
import { ItemList } from './ItemList';
import { mockListLayout, type ScrollToMock } from '../../test/listLayout';

const ROW = 44;

function idOf(tag: string): ItemId {
  const item = useEditor.getState().items.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No item tagged ${tag}`);
  return item.id;
}

function selectedTag(): string | undefined {
  const { items, selectedId } = useEditor.getState();
  return items.find((item) => item.id === selectedId)?.tag;
}

function tags(): string[] {
  return useEditor.getState().items.map((item) => item.tag);
}

function row(tag: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(`^${tag} `) });
}

function scrollList(listbox: HTMLElement, top: number): void {
  act(() => {
    listbox.scrollTop = top;
    listbox.dispatchEvent(new Event('scroll'));
  });
}

let scrollTo: ScrollToMock;
const globalKeydown = vi.fn();

async function focusListbox(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.tab();
  await user.tab();
  const listbox = screen.getByRole('listbox', { name: 'Placed items' });
  expect(listbox).toHaveFocus();
  globalKeydown.mockClear();
  return listbox;
}

function ListWithShortcuts() {
  useKeyboardShortcuts();
  return <ItemList />;
}

beforeEach(() => {
  resetEditor(sampleLayout());
  scrollTo = mockListLayout({ viewport: 600, row: ROW });
  globalKeydown.mockClear();
  window.addEventListener('keydown', globalKeydown);
});

afterEach(() => {
  window.removeEventListener('keydown', globalKeydown);
});

describe('ItemList', () => {
  it('lists every placed item with its type, position and a count', () => {
    render(<ItemList />);
    const listbox = screen.getByRole('listbox', { name: 'Placed items' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(12);
    expect(row('CAB-01')).toHaveTextContent('Cabinet');
    expect(row('CAB-01')).toHaveTextContent('X 3.00 · Z 1.25');
    expect(row('TR-02')).toHaveTextContent('Transformer');
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('flags items that break the clearance rule with text, not only colour', () => {
    render(<ItemList />);
    expect(row('TR-01')).toHaveTextContent('Too close');
    expect(row('UPS-01')).toHaveTextContent('Too close');
    expect(row('CAB-01')).not.toHaveTextContent('Too close');
  });

  it('selects the clicked item in the store without a duplicate announcement', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await user.click(row('VFD-02'));
    expect(selectedTag()).toBe('VFD-02');
    expect(row('VFD-02')).toHaveAttribute('aria-selected', 'true');
    expect(row('VFD-01')).toHaveAttribute('aria-selected', 'false');
    expect(useEditor.getState().announcement).toBeNull();
  });

  it('follows a selection made elsewhere by scrolling only the list, never the page', () => {
    scrollTo = mockListLayout({ viewport: 5 * ROW, row: ROW });
    const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<ItemList />);
    const listbox = screen.getByRole('listbox', { name: 'Placed items' });
    const reveal = (tag: string) => {
      act(() => {
        select(idOf(tag));
      });
      scrollList(listbox, listbox.scrollTop);
    };

    reveal('UPS-02');
    const selected = row('UPS-02');
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(listbox).toHaveAttribute('aria-activedescendant', selected.id);
    expect(listbox.scrollTop).toBe(12 * ROW - 5 * ROW);

    reveal('CAB-03');
    expect(listbox.scrollTop).toBe(2 * ROW);

    reveal('TR-01');
    expect(listbox.scrollTop).toBe(9 * ROW - 5 * ROW);

    reveal('VFD-02');
    expect(listbox.scrollTop).toBe(9 * ROW - 5 * ROW);

    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.contexts.every((context) => context === listbox)).toBe(true);
    expect(scrollPage).not.toHaveBeenCalled();
  });

  it('renders only the rows in view of a long list and tells each row its place in the set', () => {
    mockListLayout({ viewport: 5 * ROW, row: ROW });
    resetEditor(generateLayout(500));
    render(<ItemList />);
    const listbox = screen.getByRole('listbox', { name: 'Placed items' });
    const options = within(listbox).getAllByRole('option');

    expect(options.length).toBeGreaterThanOrEqual(5);
    expect(options.length).toBeLessThan(20);
    expect(options[0]).toHaveAttribute('aria-posinset', '1');
    expect(options[0]).toHaveAttribute('aria-setsize', '500');

    scrollList(listbox, 250 * ROW);
    const scrolled = within(listbox).getAllByRole('option');
    expect(scrolled.length).toBeLessThan(20);
    expect(scrolled.map((option) => option.getAttribute('aria-posinset'))).toContain('251');
    expect(scrolled.map((option) => option.getAttribute('aria-posinset'))).not.toContain('1');
  });

  it('keeps the active option rendered and scrolls the list to it with End', async () => {
    mockListLayout({ viewport: 5 * ROW, row: ROW });
    const layout = generateLayout(500);
    resetEditor(layout);
    const user = userEvent.setup();
    render(<ItemList />);
    const listbox = await focusListbox(user);

    await user.keyboard('{End}');
    const last = layout.at(-1);
    expect(useEditor.getState().selectedId).toBe(last?.id);
    const activeId = listbox.getAttribute('aria-activedescendant') ?? '';
    const active = document.getElementById(activeId);
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveAttribute('aria-posinset', '500');
    expect(active).toHaveTextContent(last?.tag ?? '');
    expect(listbox.scrollTop).toBe(500 * ROW - 5 * ROW);
    expect(within(listbox).getAllByRole('option').length).toBeLessThan(20);

    await user.keyboard('{Home}');
    expect(listbox.scrollTop).toBe(0);
    expect(
      document.getElementById(listbox.getAttribute('aria-activedescendant') ?? ''),
    ).toHaveAttribute('aria-posinset', '1');
    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it('moves the selection with arrow keys, Home and End without triggering global shortcuts', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    const listbox = await focusListbox(user);
    expect(listbox).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    expect(selectedTag()).toBe('CAB-01');
    expect(listbox).toHaveAttribute('aria-activedescendant', row('CAB-01').id);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selectedTag()).toBe('CAB-03');
    await user.keyboard('{ArrowUp}');
    expect(selectedTag()).toBe('CAB-02');
    await user.keyboard('{End}');
    expect(selectedTag()).toBe('UPS-02');
    await user.keyboard('{ArrowDown}');
    expect(selectedTag()).toBe('UPS-02');
    await user.keyboard('{Home}');
    expect(selectedTag()).toBe('CAB-01');
    await user.keyboard('{ArrowUp}');
    expect(selectedTag()).toBe('CAB-01');

    expect(globalKeydown).not.toHaveBeenCalled();
    expect(useEditor.getState().items.find((item) => item.tag === 'CAB-01')).toMatchObject({
      x: 3,
      z: 1.25,
    });
  });

  it('starts from the last item when ArrowUp is pressed with nothing selected', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await focusListbox(user);
    await user.keyboard('{ArrowUp}');
    expect(selectedTag()).toBe('UPS-02');
  });

  it('deletes the selected item with Delete and selects the next one', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    act(() => {
      select(idOf('CAB-02'));
    });
    await focusListbox(user);
    await user.keyboard('{Delete}');

    expect(tags()).not.toContain('CAB-02');
    expect(selectedTag()).toBe('CAB-03');
    expect(screen.queryByRole('option', { name: /^CAB-02 / })).not.toBeInTheDocument();
    expect(useEditor.getState().announcement?.text).toMatch(/^Deleted CAB-02\./);
    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it('redoes a delete from the list with the next row selected again', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    act(() => {
      select(idOf('CAB-02'));
    });
    await focusListbox(user);
    await user.keyboard('{Delete}');
    expect(selectedTag()).toBe('CAB-03');
    act(() => {
      undo();
    });
    expect(selectedTag()).toBe('CAB-02');
    act(() => {
      redo();
    });
    expect(selectedTag()).toBe('CAB-03');
  });

  it('selects the previous item after deleting the last one, and undo restores both', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    const before = tags();
    act(() => {
      select(idOf('UPS-02'));
    });
    await focusListbox(user);
    await user.keyboard('{Backspace}');

    expect(tags()).toEqual(before.slice(0, -1));
    expect(selectedTag()).toBe('TR-02');

    act(() => {
      undo();
    });
    expect(tags()).toEqual(before);
    expect(selectedTag()).toBe('UPS-02');
    expect(row('UPS-02')).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps keyboard focus in the panel when Delete removes the last row shown', async () => {
    const user = userEvent.setup();
    resetEditor(sampleLayout().slice(0, 1));
    render(<ItemList />);
    act(() => {
      select(idOf('CAB-01'));
    });
    await focusListbox(user);
    await user.keyboard('{Delete}');

    const empty = screen.getByText('No items placed yet');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(empty);
  });

  it('clears text selected elsewhere on the page when a row is picked, as a click on the page would', () => {
    render(<ItemList />);
    const note = document.createElement('p');
    note.textContent = 'TR-01 and UPS-01 are 0.50 m apart';
    document.body.append(note);
    document.getSelection()?.selectAllChildren(note);
    fireEvent.click(row('TR-02'));
    expect(document.getSelection()?.toString()).toBe('');
    expect(selectedTag()).toBe('TR-02');
    note.remove();
  });

  it('focuses the 3D view on the selected item with Enter', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    act(() => {
      select(idOf('TR-01'));
    });
    await focusListbox(user);
    await user.keyboard('{Enter}');
    expect(useEditor.getState().camera).toMatchObject({ seq: 1, focusId: idOf('TR-01') });
    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it('while placing, leaves the arrow keys and Enter to placement, so they move and place the preview', async () => {
    const user = userEvent.setup();
    render(<ListWithShortcuts />);
    act(() => {
      select(idOf('CAB-02'));
    });
    await focusListbox(user);
    act(() => {
      startPlacement('cabinet');
    });
    const ghost = useEditor.getState().ghost;
    if (!ghost) throw new Error('No placement preview');
    const moved = { x: ghost.x, z: ghost.z + 0.5 };

    await user.keyboard('{ArrowDown}');
    expect(selectedTag()).toBe('CAB-02');
    expect(useEditor.getState().ghost).toEqual(moved);

    await user.keyboard('{Enter}');
    expect(useEditor.getState().tool.type).toBe('select');
    expect(selectedTag()).toBe('CAB-05');
    expect(row('CAB-05')).toHaveTextContent(`X ${moved.x.toFixed(2)} · Z ${moved.z.toFixed(2)}`);
  });

  it('leaves unrelated keys and modified keys to the global shortcuts', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await focusListbox(user);
    await user.keyboard('r');
    await user.keyboard('{Meta>}{Backspace}{/Meta}');
    expect(globalKeydown).toHaveBeenCalledTimes(3);
    expect(tags()).toHaveLength(12);
  });

  it('filters by tag or localised type name, ignoring case', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    const filter = screen.getByRole('searchbox', { name: 'Filter placed items' });

    await user.type(filter, 'vfd');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(row('VFD-04')).toBeInTheDocument();
    expect(screen.getByText('4 of 12')).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'TRANSFORMER');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(row('TR-01')).toBeInTheDocument();
    expect(row('TR-02')).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'switchgear');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(row('CAB-04')).toBeInTheDocument();
  });

  it('matches Vietnamese type names with or without diacritics', async () => {
    const user = userEvent.setup();
    act(() => {
      setLocale('vi');
    });
    render(<ItemList />);
    const filter = screen.getByRole('searchbox', { name: 'Lọc thiết bị đã đặt' });

    await user.type(filter, 'bien ap');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(row('TR-01')).toHaveTextContent('Máy biến áp');
    expect(row('TR-01')).toHaveTextContent('X 15,75 · Z 2,50');
    expect(screen.getByText('2 trên 12')).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'BIẾN ÁP');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('announces how many items match once typing pauses', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await user.type(screen.getByRole('searchbox'), 'ups');
    await waitFor(() => {
      expect(useEditor.getState().announcement?.text).toBe('2 items match.');
    });
  });

  it('shows a no-match state whose button clears the filter and refocuses it', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    const filter = screen.getByRole('searchbox');
    await user.type(filter, 'zzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('No items match “zzz”')).toBeInTheDocument();
    expect(screen.getByText('0 of 12')).toBeInTheDocument();

    const focus = vi.spyOn(filter, 'focus');
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(filter).toHaveValue('');
    expect(filter).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(screen.getAllByRole('option')).toHaveLength(12);
  });

  it('caps a pasted long filter and echoes it shortened, keeping the full query in a tooltip', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    const filter = screen.getByRole('searchbox');
    await user.click(filter);
    await user.paste('x'.repeat(300));

    expect(filter).toHaveValue('x'.repeat(64));
    expect(screen.getByText(`No items match “${'x'.repeat(24)}…”`)).toHaveAttribute(
      'title',
      'x'.repeat(64),
    );

    const family = '👨‍👩‍👧';
    await user.clear(filter);
    await user.paste(`${'a'.repeat(23)}${family}b`);
    expect(screen.getByText(`No items match “${'a'.repeat(23)}${family}…”`)).toBeInTheDocument();
  });

  it('syncs hover with the store in both directions', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await user.hover(row('CAB-03'));
    expect(useEditor.getState().hoveredId).toBe(idOf('CAB-03'));
    await user.unhover(row('CAB-03'));
    expect(useEditor.getState().hoveredId).toBeNull();

    act(() => {
      hover(idOf('VFD-04'));
    });
    expect(row('VFD-04')).toHaveAttribute('data-hovered');
    expect(row('VFD-03')).not.toHaveAttribute('data-hovered');
  });

  it('shows live positions and clearance flags while an item is dragged', () => {
    render(<ItemList />);
    act(() => {
      beginDrag(idOf('VFD-02'));
      updateDrag({ x: 3.75, z: 3.75 });
    });
    expect(row('VFD-02')).toHaveTextContent('X 3.75 · Z 3.75');
    expect(row('VFD-02')).toHaveTextContent('Too close');
    expect(row('VFD-01')).toHaveTextContent('Too close');
  });

  it('shows an empty state when nothing is placed', () => {
    resetEditor([]);
    render(<ItemList />);
    expect(screen.getByText('No items placed yet')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
