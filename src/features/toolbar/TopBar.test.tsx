import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveItem, select, setLocale, startPlacement } from '../../state/actions';
import { DEFAULT_SESSION, resetEditor, useEditor, type Session } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { useShortcutStore } from '../shortcuts/shortcutStore';
import { useKeyboardShortcuts } from '../shortcuts/useKeyboardShortcuts';
import { COMPACT_TOOLBAR_QUERY, TopBar } from './TopBar';

const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const drive = makeItem({ kind: 'drive', tag: 'VFD-01', x: 8.25, z: 6.25 });
const HOST_SESSION: Session = {
  projectId: 'sub-4b',
  projectName: 'Substation 4, line B',
  userName: null,
  embedded: true,
};

beforeEach(() => {
  resetEditor([cabinet, drive]);
  useShortcutStore.setState({ helpOpen: false, singleKeys: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const editor = () => useEditor.getState();
const tags = () => editor().items.map((item) => item.tag);
const button = (name: string) => screen.getByRole('button', { name });
const toolbar = () => screen.getByRole('toolbar', { name: 'Edit tools' });
const tools = () => within(toolbar()).getAllByRole('button');
const toolNames = () => tools().map((tool) => tool.getAttribute('aria-label') ?? tool.textContent);

function expectAvailable(name: string, available: boolean): void {
  expect(button(name)).toHaveAttribute('aria-disabled', String(!available));
}

function selectItem(id: typeof cabinet.id): void {
  act(() => {
    select(id);
  });
}

function TopBarWithShortcuts() {
  useKeyboardShortcuts();
  return <TopBar />;
}

function fakeMediaQuery(media: string, matches: boolean) {
  return Object.assign(new EventTarget(), {
    media,
    matches,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  });
}

function stubScreen(narrow: boolean) {
  const compact = fakeMediaQuery(COMPACT_TOOLBAR_QUERY, narrow);
  vi.stubGlobal('matchMedia', (media: string) =>
    media === COMPACT_TOOLBAR_QUERY ? compact : fakeMediaQuery(media, false),
  );
  return {
    resize(nextNarrow: boolean): void {
      compact.matches = nextNarrow;
      act(() => {
        compact.dispatchEvent(new Event('change'));
      });
    },
  };
}

describe('TopBar', () => {
  it('shows the product, the project and the signed-in user that the host supplies', () => {
    useEditor.setState({ session: { ...HOST_SESSION, userName: 'Alex Morgan' } });
    render(<TopBar />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Layout Editor' })).toBeInTheDocument();
    expect(screen.getByText('Project: Substation 4, line B')).toBeInTheDocument();
    expect(screen.getByText('Signed in as Alex Morgan')).toBeInTheDocument();
  });

  it('names the built-in sample project in the interface language', () => {
    act(() => {
      setLocale('vi');
    });
    render(<TopBar />);

    expect(screen.getByText('Dự án: Phòng điện mẫu')).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveTextContent('Electrical room A');
  });

  it('leaves the language to the host when the editor is embedded', () => {
    useEditor.setState({ session: HOST_SESSION });
    render(<TopBar />);

    expect(screen.queryByRole('radiogroup', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('shows the whole user name on hover, where a long one is cut short', () => {
    useEditor.setState({
      session: { ...DEFAULT_SESSION, userName: 'Nguyễn Thị Minh Khai Trần Hoàng Anh' },
    });
    render(<TopBar />);

    expect(
      screen.getByText('Signed in as Nguyễn Thị Minh Khai Trần Hoàng Anh').parentElement,
    ).toHaveAttribute('title', 'Nguyễn Thị Minh Khai Trần Hoàng Anh');
  });

  it('leaves the user out when the session has none', () => {
    render(<TopBar />);

    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it('enables undo and redo only with history and names the next step', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    expectAvailable('Undo', false);
    expectAvailable('Redo', false);
    await user.click(button('Undo'));
    expect(editor().history.future).toHaveLength(0);

    act(() => {
      moveItem(cabinet.id, { x: 5, z: 1.25 });
    });
    const undo = button('Undo: Move CAB-01');
    expectAvailable('Undo: Move CAB-01', true);
    expect(undo).toHaveAttribute('aria-keyshortcuts', 'Control+Z');

    await user.click(undo);
    expect(editor().items[0]?.x).toBe(3);
    expectAvailable('Undo', false);

    const redo = button('Redo: Move CAB-01');
    expect(redo).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Control+Y');
    await user.click(redo);
    expect(editor().items[0]?.x).toBe(5);
    expectAvailable('Redo', false);
  });

  it('enables rotate, duplicate and delete only with a selection and applies them to it', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    for (const name of ['Rotate counter-clockwise', 'Rotate clockwise', 'Duplicate', 'Delete']) {
      expectAvailable(name, false);
      await user.click(button(name));
    }
    expect(editor().items).toEqual([cabinet, drive]);

    selectItem(cabinet.id);
    await user.click(button('Rotate clockwise'));
    expect(editor().items[0]?.rotation).toBe(90);
    await user.click(button('Rotate counter-clockwise'));
    expect(editor().items[0]?.rotation).toBe(0);

    await user.click(button('Duplicate'));
    expect(tags()).toEqual(['CAB-01', 'VFD-01', 'CAB-02']);

    await user.click(button('Delete'));
    expect(tags()).toEqual(['CAB-01', 'VFD-01']);
    expectAvailable('Delete', false);
  });

  it('rotates the placement preview while placing', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    act(() => {
      startPlacement('transformer');
    });

    await user.click(button('Rotate clockwise'));

    expect(editor().tool).toMatchObject({ type: 'place', kind: 'transformer', rotation: 90 });
    expectAvailable('Duplicate', false);
  });

  it('clears the layout in one undoable step and disables Clear when empty', async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(button('Clear layout'));
    expect(editor().items).toEqual([]);
    expectAvailable('Clear layout', false);

    await user.click(button('Undo: Clear layout'));
    expect(editor().items).toEqual([cabinet, drive]);
  });

  it('switches the interface language', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));

    expect(editor().locale).toBe('vi');
    expect(screen.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Ngôn ngữ' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Công cụ chỉnh sửa' })).toBeInTheDocument();
    expectAvailable('Hoàn tác', false);
    expectAvailable('Xóa bố trí', true);
  });

  it('toggles the assistant panel', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    const toggle = button('Assistant');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(editor().inspectorTab).toBe('assistant');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(editor().inspectorTab).toBe('inspect');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the keyboard shortcut dialog from the keyboard button and returns focus to it', async () => {
    const user = userEvent.setup();
    render(<TopBarWithShortcuts />);
    const help = button('Keyboard shortcuts');
    expect(help).toHaveAttribute('aria-keyshortcuts', '?');
    expect(help).toHaveAttribute('aria-haspopup', 'dialog');
    expect(help).toHaveAttribute('aria-expanded', 'false');

    await user.click(help);

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(useShortcutStore.getState().helpOpen).toBe(true);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('banner', { hidden: true })).toHaveLength(1);
    expect(screen.queryByRole('contentinfo', { hidden: true })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(help).toHaveFocus();
    });
    expect(useShortcutStore.getState().helpOpen).toBe(false);
  });

  it('is a single tab stop whose tools the arrow keys move through, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<TopBarWithShortcuts />);
    selectItem(cabinet.id);
    expect(toolNames()).toEqual([
      'Undo',
      'Redo',
      'Rotate counter-clockwise',
      'Rotate clockwise',
      'Duplicate',
      'Delete',
      'Clear layout',
    ]);
    expect(tools().filter((tool) => tool.tabIndex === 0)).toHaveLength(1);

    await user.tab();
    expect(button('Undo')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(button('Redo')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(button('Rotate counter-clockwise')).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(button('Clear layout')).toHaveFocus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowRight}{ArrowDown}{/Shift}{ArrowUp}');
    expect(button('Undo')).toHaveFocus();
    expect(editor().items[0]).toMatchObject({ x: 3, z: 1.25 });

    await user.tab();
    expect(toolbar().contains(document.activeElement)).toBe(false);
    await user.tab({ shift: true });
    expect(button('Undo')).toHaveFocus();
  });

  it('keeps focus on a tool that becomes unavailable, where editing shortcuts still work', async () => {
    const user = userEvent.setup();
    render(<TopBarWithShortcuts />);
    selectItem(cabinet.id);

    await user.click(button('Delete'));
    expect(tags()).toEqual(['VFD-01']);
    expectAvailable('Delete', false);
    expect(button('Delete')).toHaveFocus();

    await user.keyboard('{Control>}z{/Control}');
    expect(tags()).toEqual(['CAB-01', 'VFD-01']);
    expect(editor().selectedId).toBe(cabinet.id);
  });

  it('leaves the selection tools out on narrow screens', () => {
    stubScreen(true);
    render(<TopBar />);

    expect(toolNames()).toEqual(['Undo', 'Redo', 'Clear layout']);
    expect(tools().filter((tool) => tool.tabIndex === 0)).toHaveLength(1);
  });

  it('moves the tab stop to a visible tool when the window becomes narrow', async () => {
    const user = userEvent.setup();
    const screenSize = stubScreen(false);
    render(<TopBar />);
    selectItem(cabinet.id);
    act(() => {
      button('Delete').focus();
    });
    expect(button('Delete')).toHaveAttribute('tabindex', '0');

    screenSize.resize(true);

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    const stops = tools().filter((tool) => tool.tabIndex === 0);
    expect(stops).toHaveLength(1);
    act(() => {
      document.body.focus();
    });
    await user.tab();
    expect(stops[0]).toHaveFocus();

    screenSize.resize(false);
    expect(toolNames()).toHaveLength(7);
    expect(tools().filter((tool) => tool.tabIndex === 0)).toHaveLength(1);
  });

  it('drops single-key hints while single-key shortcuts are off', () => {
    useShortcutStore.setState({ singleKeys: false });
    render(<TopBar />);
    selectItem(cabinet.id);

    expect(button('Rotate clockwise')).not.toHaveAttribute('aria-keyshortcuts');
    expect(button('Keyboard shortcuts')).not.toHaveAttribute('aria-keyshortcuts');
    expect(button('Delete')).toHaveAttribute('aria-keyshortcuts', 'Delete Backspace');
    expect(button('Undo')).toHaveAttribute('aria-keyshortcuts', 'Control+Z');
  });
});
