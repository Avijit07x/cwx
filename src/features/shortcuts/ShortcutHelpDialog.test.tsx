import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslator } from '../../i18n/translate';
import { select, setLocale } from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { SHORTCUTS } from './shortcuts';
import {
  readSingleKeyPreference,
  setShortcutHelpOpen,
  SINGLE_KEY_STORAGE_KEY,
  useShortcutStore,
} from './shortcutStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });

beforeEach(() => {
  resetEditor([cabinet]);
  window.localStorage.clear();
  useShortcutStore.setState({ helpOpen: false, singleKeys: true });
});

function Harness() {
  useKeyboardShortcuts();
  return (
    <>
      <div role="group" tabIndex={0} aria-label="3D view" />
      <ShortcutHelpDialog trigger={<button type="button">Open shortcuts</button>} />
    </>
  );
}

function openDialog(name = 'Keyboard shortcuts'): Promise<HTMLElement> {
  render(<Harness />);
  act(() => {
    setShortcutHelpOpen(true);
  });
  return screen.findByRole('dialog', { name });
}

function rowOf(dialog: HTMLElement, action: string): HTMLElement {
  const row = within(dialog).getByText(action).parentElement;
  if (!row) throw new Error(`No row for ${action}`);
  return row;
}

function outsideOf(dialog: HTMLElement): HTMLElement {
  const viewport = dialog.parentElement;
  if (!viewport) throw new Error('The dialog has no viewport');
  return viewport;
}

async function waitForInitialFocus(dialog: HTMLElement): Promise<HTMLElement> {
  const close = within(dialog).getByRole('button', { name: 'Close' });
  await waitFor(() => {
    expect(close).toHaveFocus();
  });
  return close;
}

async function expectClosed(): Promise<void> {
  expect(useShortcutStore.getState().helpOpen).toBe(false);
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
}

describe('ShortcutHelpDialog', () => {
  it('opens as a modal dialog that lists every shortcut in the table, grouped', async () => {
    const dialog = await openDialog();
    const t = getTranslator('en');

    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Keyboard shortcuts',
    );
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Selection', 'Move and rotate', 'Edit', 'Place equipment', 'View', 'Help']);
    for (const shortcut of SHORTCUTS) {
      expect(within(dialog).getByText(shortcut.describe(t))).toBeInTheDocument();
    }
    expect(screen.queryByRole('group', { name: '3D view' })).not.toBeInTheDocument();
  });

  it('shows the keys for each shortcut, with alternatives', async () => {
    const dialog = await openDialog();

    expect(within(rowOf(dialog, 'Undo')).getByText('Ctrl+Z')).toBeInTheDocument();
    const redo = rowOf(dialog, 'Redo');
    expect(within(redo).getByText('Ctrl+Shift+Z')).toBeInTheDocument();
    expect(within(redo).getByText('or')).toBeInTheDocument();
    expect(within(redo).getByText('Ctrl+Y')).toBeInTheDocument();
    expect(rowOf(dialog, 'Move by one cell (0.50 m)')).toHaveTextContent('↑ or ↓ or ← or →');
    expect(rowOf(dialog, 'Start placing: Transformer')).toHaveTextContent('3');
  });

  it('opens from its trigger, takes focus and gives it back to the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open shortcuts' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(useShortcutStore.getState().helpOpen).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitForInitialFocus(dialog);

    await user.keyboard('{Escape}');
    await expectClosed();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('gives focus back to where it was when ? opened it, and Escape only closes the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    act(() => {
      select(cabinet.id);
    });
    const view = screen.getByRole('group', { name: '3D view' });
    act(() => {
      view.focus();
    });

    await user.keyboard('?');
    await waitForInitialFocus(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' }));

    await user.keyboard('{Escape}');
    await expectClosed();
    await waitFor(() => {
      expect(view).toHaveFocus();
    });
    expect(useEditor.getState().selectedId).toBe(cabinet.id);
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open shortcuts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    const list = within(dialog).getByRole('region', { name: 'Shortcut list' });
    const toggle = within(dialog).getByRole('switch', { name: 'Single-key shortcuts' });
    const close = await waitForInitialFocus(dialog);

    await user.tab();
    expect(list).toHaveFocus();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.tab();
    await waitFor(() => {
      expect(close).toHaveFocus();
    });
    await user.tab({ shift: true });
    await waitFor(() => {
      expect(toggle).toHaveFocus();
    });
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await expectClosed();
  });

  it('closes on a click outside the dialog but not on a click inside it', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();

    await user.click(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' }));
    expect(useShortcutStore.getState().helpOpen).toBe(true);

    await user.click(outsideOf(dialog));
    await expectClosed();
  });

  it('stays open when a text selection drag ends outside the dialog', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();

    await user.pointer([
      { keys: '[MouseLeft>]', target: within(dialog).getByText('Undo') },
      { target: outsideOf(dialog) },
      { keys: '[/MouseLeft]' },
    ]);

    expect(useShortcutStore.getState().helpOpen).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows single-key shortcuts switched on when no choice is stored', async () => {
    useShortcutStore.setState({ singleKeys: readSingleKeyPreference() });
    const dialog = await openDialog();

    expect(within(dialog).getByRole('switch', { name: 'Single-key shortcuts' })).toBeChecked();
    expect(within(dialog).queryByText('Off')).not.toBeInTheDocument();
  });

  it('switches single-key shortcuts off and on and remembers the choice', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();
    const toggle = within(dialog).getByRole('switch', { name: 'Single-key shortcuts' });

    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/\[ \] F R 1 2 3 4 \+ = - \? Turn these off/);

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(useShortcutStore.getState().singleKeys).toBe(false);
    expect(window.localStorage.getItem(SINGLE_KEY_STORAGE_KEY)).toBe('off');
    expect(readSingleKeyPreference()).toBe(false);
    expect(rowOf(dialog, 'Rotate clockwise')).toHaveTextContent('Off');
    expect(rowOf(dialog, 'Show this list')).toHaveTextContent('Off');
    expect(rowOf(dialog, 'Undo')).not.toHaveTextContent('Off');

    await user.click(within(dialog).getByText('Single-key shortcuts'));
    expect(toggle).toBeChecked();
    expect(useShortcutStore.getState().singleKeys).toBe(true);
    expect(readSingleKeyPreference()).toBe(true);
    expect(within(dialog).queryByText('Off')).not.toBeInTheDocument();
  });

  it('switches with the keyboard without closing the dialog', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog();
    const toggle = within(dialog).getByRole('switch', { name: 'Single-key shortcuts' });
    await waitForInitialFocus(dialog);
    await user.tab();
    await user.tab();
    expect(toggle).toHaveFocus();

    await user.keyboard(' ');
    expect(useShortcutStore.getState().singleKeys).toBe(false);
    await user.keyboard('{Enter}');
    expect(useShortcutStore.getState().singleKeys).toBe(true);
    expect(useShortcutStore.getState().helpOpen).toBe(true);
  });

  it('keeps working when browser storage is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readSingleKeyPreference()).toBe(true);
    const dialog = await openDialog();
    await user.click(within(dialog).getByRole('switch', { name: 'Single-key shortcuts' }));

    expect(useShortcutStore.getState().singleKeys).toBe(false);
  });

  it('is fully translated into Vietnamese', async () => {
    setLocale('vi');
    const dialog = await openDialog('Phím tắt');

    expect(within(dialog).getByRole('heading', { name: 'Chỉnh sửa' })).toBeInTheDocument();
    expect(within(dialog).getByText('Di chuyển một ô (0,50 m)')).toBeInTheDocument();
    expect(within(dialog).getByText('Bắt đầu đặt: Máy biến áp')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'Danh sách phím tắt' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Phím tắt một phím' })).toBeChecked();
  });
});
