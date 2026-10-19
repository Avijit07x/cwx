import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleLayout } from '../../domain/seed';
import type { ItemId, PlacedItem } from '../../domain/types';
import { beginDrag, cancelDrag, select, setLocale, undo, updateDrag } from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { PropertiesPanel } from './PropertiesPanel';

function idOf(tag: string): ItemId {
  const item = useEditor.getState().items.find((candidate) => candidate.tag === tag);
  if (!item) throw new Error(`No item tagged ${tag}`);
  return item.id;
}

function itemWithId(id: ItemId): PlacedItem | undefined {
  return useEditor.getState().items.find((item) => item.id === id);
}

function renderWithSelection(tag: string): ItemId {
  const id = idOf(tag);
  act(() => {
    select(id);
  });
  render(<PropertiesPanel />);
  return id;
}

const tagInput = () => screen.getByRole('textbox', { name: 'Tag' });
const xInput = () => screen.getByRole('textbox', { name: 'X' });
const zInput = () => screen.getByRole('textbox', { name: 'Z' });
const stepper = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  resetEditor(sampleLayout());
});

describe('PropertiesPanel', () => {
  it('shows an empty state when nothing is selected', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('No item selected')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('describes the selected item using its rotated footprint', () => {
    renderWithSelection('TR-02');
    expect(screen.getByRole('heading', { name: 'TR-02' })).toBeInTheDocument();
    expect(screen.getByText('Dry-type transformer')).toBeInTheDocument();
    expect(tagInput()).toHaveValue('TR-02');
    expect(xInput()).toHaveValue('4.00');
    expect(zInput()).toHaveValue('9.25');
    expect(xInput()).toHaveAttribute('aria-roledescription', 'Number field');
    expect(screen.getByRole('radio', { name: '90°' })).toBeChecked();
    expect(screen.getByText('1.00 m × 1.50 m × 1.80 m')).toBeInTheDocument();
    expect(screen.getByText('LE-TRF-1510')).toBeInTheDocument();
    expect(screen.getByText('$18,500.00')).toBeInTheDocument();
  });

  it('limits X and Z to the room for the rotated footprint, with Home and End jumping to the walls', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('TR-02');

    await user.click(xInput());
    await user.keyboard('{End}');
    expect(itemWithId(id)?.x).toBe(19.5);
    expect(xInput()).toHaveValue('19.50');
    expect(stepper('Increase X')).toHaveAttribute('data-disabled');
    await user.keyboard('{Home}');
    expect(itemWithId(id)?.x).toBe(0.5);
    expect(stepper('Decrease X')).toHaveAttribute('data-disabled');
    expect(stepper('Increase X')).not.toHaveAttribute('data-disabled');

    await user.click(zInput());
    await user.keyboard('{End}');
    expect(itemWithId(id)?.z).toBe(11.25);
    await user.keyboard('{Home}');
    expect(itemWithId(id)?.z).toBe(0.75);
    expect(useEditor.getState().history.past).toHaveLength(4);
  });

  it('renames on Enter as one undoable step', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(tagInput());
    await user.type(tagInput(), 'MAIN-SWG{Enter}');

    expect(itemWithId(id)?.tag).toBe('MAIN-SWG');
    expect(screen.getByRole('heading', { name: 'MAIN-SWG' })).toBeInTheDocument();
    expect(useEditor.getState().history.past).toHaveLength(1);

    act(() => {
      undo();
    });
    expect(itemWithId(id)?.tag).toBe('CAB-01');
    expect(tagInput()).toHaveValue('CAB-01');
  });

  it('renames on blur', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(tagInput());
    await user.type(tagInput(), 'CAB-A');
    await user.tab();
    expect(itemWithId(id)?.tag).toBe('CAB-A');
  });

  it('rejects a duplicate tag inline, without a toast, and Escape reverts it', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    const toastsBefore = toast.getHistory().length;
    await user.clear(tagInput());
    await user.type(tagInput(), 'cab-02{Enter}');

    expect(tagInput()).toHaveAttribute('aria-invalid', 'true');
    expect(tagInput()).toHaveAccessibleDescription('cab-02 is already used by another item.');
    expect(itemWithId(id)?.tag).toBe('CAB-01');
    expect(toast.getHistory()).toHaveLength(toastsBefore);
    expect(useEditor.getState().history.past).toHaveLength(0);
    expect(useEditor.getState().announcement?.text).toBe('cab-02 is already used by another item.');

    await user.keyboard('{Escape}');
    expect(tagInput()).toHaveValue('CAB-01');
    expect(tagInput()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('cab-02 is already used by another item.')).not.toBeInTheDocument();
  });

  it('asks for a tag when the field is emptied', async () => {
    const user = userEvent.setup();
    renderWithSelection('CAB-01');
    await user.clear(tagInput());
    await user.keyboard('{Enter}');
    expect(tagInput()).toHaveAccessibleDescription('Enter a tag.');
  });

  it('moves the item from the X field on Enter, as one undoable step, keeping focus', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(xInput());
    await user.type(xInput(), '12{Enter}');

    expect(itemWithId(id)).toMatchObject({ x: 12, z: 1.25 });
    expect(xInput()).toHaveValue('12.00');
    expect(xInput()).toHaveFocus();
    expect(useEditor.getState().history.past).toHaveLength(1);
    expect(useEditor.getState().announcement?.text).toBe('CAB-01 moved to X 12.00 m, Z 1.25 m.');

    act(() => {
      undo();
    });
    expect(itemWithId(id)).toMatchObject({ x: 3, z: 1.25 });
    expect(xInput()).toHaveValue('3.00');
  });

  it('snaps typed values to the grid and keeps the item inside the room', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(xInput());
    await user.type(xInput(), '99{Enter}');
    expect(itemWithId(id)?.x).toBe(19.5);
    expect(xInput()).toHaveValue('19.50');

    await user.clear(xInput());
    await user.type(xInput(), '3.3{Enter}');
    expect(itemWithId(id)?.x).toBe(3.5);
    expect(xInput()).toHaveValue('3.50');

    await user.clear(zInput());
    await user.type(zInput(), '0');
    await user.tab();
    expect(itemWithId(id)?.z).toBe(0.25);
    expect(zInput()).toHaveValue('0.25');
  });

  it('steps by 0.5 m from the buttons and the arrow keys, one undo step each', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');

    await user.click(stepper('Increase X'));
    expect(itemWithId(id)?.x).toBe(3.5);
    expect(xInput()).toHaveValue('3.50');
    await user.click(stepper('Decrease Z'));
    expect(itemWithId(id)?.z).toBe(0.75);

    await user.click(xInput());
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(itemWithId(id)?.x).toBe(4.5);
    await user.keyboard('{ArrowDown}');
    expect(itemWithId(id)?.x).toBe(4);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(itemWithId(id)?.x).toBe(5);
    expect(useEditor.getState().history.past).toHaveLength(6);

    act(() => {
      undo();
    });
    expect(itemWithId(id)?.x).toBe(4);
    expect(xInput()).toHaveValue('4.00');
  });

  it('commits a typed coordinate on blur and ignores an emptied field', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(xInput());
    await user.type(xInput(), '8');
    expect(itemWithId(id)?.x).toBe(3);
    await user.tab();
    expect(itemWithId(id)?.x).toBe(8);
    expect(zInput()).toHaveFocus();

    await user.clear(zInput());
    await user.tab();
    expect(itemWithId(id)?.z).toBe(1.25);
    expect(zInput()).toHaveValue('1.25');
    expect(useEditor.getState().history.past).toHaveLength(1);
  });

  it('discards a typed coordinate on Escape', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(xInput());
    await user.type(xInput(), '7');
    await user.keyboard('{Escape}');
    expect(xInput()).toHaveValue('3.00');
    expect(xInput()).toHaveFocus();
    await user.tab();
    expect(itemWithId(id)?.x).toBe(3);
    expect(useEditor.getState().history.past).toHaveLength(0);
  });

  it('rotates from the radio group and updates the footprint limits', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.click(screen.getByRole('radio', { name: '90°' }));

    expect(itemWithId(id)?.rotation).toBe(90);
    expect(screen.getByText('0.50 m × 1.00 m × 2.00 m')).toBeInTheDocument();
    await user.click(xInput());
    await user.keyboard('{End}');
    expect(itemWithId(id)?.x).toBe(19.75);

    act(() => {
      undo();
      undo();
    });
    expect(itemWithId(id)).toMatchObject({ rotation: 0, x: 3 });
    expect(screen.getByRole('radio', { name: '0°' })).toBeChecked();
    expect(xInput()).toHaveValue('3.00');
  });

  it('shows the live drag preview position while the item is dragged', () => {
    const id = renderWithSelection('CAB-01');
    act(() => {
      beginDrag(id);
      updateDrag({ x: 8, z: 6 });
    });
    expect(xInput()).toHaveValue('8.00');
    expect(zInput()).toHaveValue('6.25');

    act(() => {
      cancelDrag();
    });
    expect(xInput()).toHaveValue('3.00');
    expect(zInput()).toHaveValue('1.25');
  });

  it('lists its clearance issues and selects the other item from its tag', async () => {
    const user = userEvent.setup();
    renderWithSelection('TR-01');
    expect(screen.getByRole('listitem')).toHaveTextContent('0.50 m to UPS-01');

    await user.click(screen.getByRole('button', { name: 'UPS-01' }));
    expect(useEditor.getState().selectedId).toBe(idOf('UPS-01'));
    expect(screen.getByRole('heading', { name: 'UPS-01' })).toHaveFocus();
    expect(screen.getByRole('listitem')).toHaveTextContent('0.50 m to TR-01');
  });

  it('confirms when the item meets the clearance rule', () => {
    renderWithSelection('CAB-01');
    expect(screen.getByText('Meets the 0.60 m clearance')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('reports overlapping items', () => {
    resetEditor([
      makeItem({ tag: 'A-1', x: 5.25, z: 5.25 }),
      makeItem({ tag: 'B-1', x: 5.25, z: 5.25 }),
    ]);
    renderWithSelection('A-1');
    expect(screen.getByRole('listitem')).toHaveTextContent('Overlaps B-1');
  });

  it('lists the five closest clearance issues first and counts the rest', () => {
    const around = [4.75, 5.25, 5.75];
    const neighbours = around.flatMap((x) =>
      around
        .filter((z) => x !== 5.25 || z !== 5.25)
        .map((z) => makeItem({ tag: `N-${x}-${z}`, x, z })),
    );
    resetEditor([
      makeItem({ tag: 'MID', x: 5.25, z: 5.25 }),
      makeItem({ tag: 'FAR', x: 6.25, z: 5.25 }),
      ...neighbours,
    ]);
    renderWithSelection('MID');

    const listed = screen.getAllByRole('listitem');
    expect(listed).toHaveLength(5);
    expect(listed[0]).toHaveTextContent(/^0\.00 m to N-/);
    expect(screen.queryByRole('button', { name: 'FAR' })).not.toBeInTheDocument();
    expect(screen.getByText('4 more items are too close.')).toBeInTheDocument();
  });

  it('focuses, duplicates and deletes the item from its actions', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');

    await user.click(screen.getByRole('button', { name: 'Focus' }));
    expect(useEditor.getState().camera).toMatchObject({ seq: 1, focusId: id });

    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    const copy = useEditor.getState().items.at(-1);
    expect(useEditor.getState().items).toHaveLength(13);
    expect(copy?.tag).toBe('CAB-05');
    expect(useEditor.getState().selectedId).toBe(copy?.id);
    expect(screen.getByRole('heading', { name: 'CAB-05' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useEditor.getState().items).toHaveLength(12);
    expect(useEditor.getState().selectedId).toBeNull();
    const empty = screen.getByText('No item selected');
    expect(empty.closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('explains the Focus button in the shared tooltip on keyboard focus, not in a native title', async () => {
    const user = userEvent.setup();
    renderWithSelection('CAB-01');
    act(() => {
      screen.getByRole('button', { name: 'Duplicate' }).focus();
    });
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Focus' })).toHaveFocus();
    expect(await screen.findByText('Move the 3D view to this item')).toBeInTheDocument();
    expect(screen.queryByTitle('Move the 3D view to this item')).not.toBeInTheDocument();
  });

  it('is fully translated into Vietnamese with local number formats', () => {
    act(() => {
      setLocale('vi');
    });
    renderWithSelection('TR-01');
    expect(screen.getByRole('textbox', { name: 'Mã thiết bị' })).toHaveValue('TR-01');
    expect(screen.getByText('Máy biến áp khô')).toBeInTheDocument();
    expect(screen.getByText('1,50 m × 1,00 m × 1,80 m')).toBeInTheDocument();
    expect(screen.getByText('18.500,00 US$')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Cách UPS-01 0,50 m');
    expect(screen.getByRole('button', { name: 'Xóa' })).toBeInTheDocument();
    expect(xInput()).toHaveValue('15,75');
    expect(xInput()).toHaveAttribute('aria-roledescription', 'Trường số');
    expect(stepper('Tăng X')).toBeInTheDocument();
    expect(stepper('Giảm Z')).toBeInTheDocument();
  });

  it('reads and writes coordinates with the Vietnamese decimal comma', async () => {
    act(() => {
      setLocale('vi');
    });
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    expect(xInput()).toHaveValue('3,00');

    await user.clear(xInput());
    await user.type(xInput(), '12,5{Enter}');
    expect(itemWithId(id)?.x).toBe(12.5);
    expect(xInput()).toHaveValue('12,50');
  });

  it('never reads the other decimal separator as a thousands separator', async () => {
    const user = userEvent.setup();
    const id = renderWithSelection('CAB-01');
    await user.clear(xInput());
    await user.type(xInput(), '6,5{Enter}');
    expect(itemWithId(id)?.x).toBe(6);

    act(() => {
      setLocale('vi');
    });
    await user.clear(xInput());
    await user.type(xInput(), '6.5{Enter}');
    expect(itemWithId(id)?.x).toBe(6.5);
    expect(xInput()).toHaveValue('6,50');
  });
});
