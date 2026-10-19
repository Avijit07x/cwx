import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale, startPlacement } from '../../state/actions';
import { resetEditor, useEditor } from '../../state/store';
import { useShortcutStore } from '../shortcuts/shortcutStore';
import { Palette } from './Palette';

beforeEach(() => {
  resetEditor();
  useShortcutStore.setState({ helpOpen: false, singleKeys: true });
});

const editor = () => useEditor.getState();
const card = (name: string) => screen.getByRole('button', { name });

function tileOf(button: HTMLElement): HTMLElement {
  const tile = button.closest('li');
  if (!tile) throw new Error('The card button is not inside a list item');
  return tile;
}

describe('Palette', () => {
  it('lists the four equipment types with size, hotkey and part number', () => {
    render(<Palette />);

    expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cabinet',
      'Drive',
      'Transformer',
      'UPS',
    ]);

    const cabinet = card('Cabinet');
    expect(cabinet).toHaveAccessibleDescription('Width 1.00 m, depth 0.50 m, height 2.00 m');
    expect(cabinet).toHaveAttribute('title', 'Switchgear cabinet · part no. LE-SWG-1005');
    expect(cabinet).toHaveAttribute('aria-keyshortcuts', '1');
    expect(cabinet).toHaveAttribute('aria-pressed', 'false');
    const tile = tileOf(cabinet);
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('1.00')).toBeInTheDocument();
    expect(within(tile).getByText('0.50')).toBeInTheDocument();
    expect(within(tile).getByText('2.00 m')).toBeInTheDocument();

    expect(card('UPS')).toHaveAttribute('aria-keyshortcuts', '4');
    expect(
      screen.getByText('Move with the arrow keys, place with Enter. Hold Shift to keep placing.'),
    ).toBeInTheDocument();
  });

  it('names each card button by its visible label only, so speech input can target it', () => {
    render(<Palette />);

    for (const name of ['Cabinet', 'Drive', 'Transformer', 'UPS']) {
      const button = card(name);
      expect(button).toHaveAccessibleName(name);
      expect(button).toHaveTextContent(new RegExp(`^${name}$`));
      expect(button).not.toHaveAttribute('aria-labelledby');
    }
  });

  it('starts placement on click and cancels it when the active card is clicked again', async () => {
    const user = userEvent.setup();
    render(<Palette />);

    await user.click(card('Drive'));
    expect(editor().tool).toEqual({ type: 'place', kind: 'drive', rotation: 0, sticky: false });
    expect(card('Drive')).toHaveAttribute('aria-pressed', 'true');
    expect(card('Cabinet')).toHaveAttribute('aria-pressed', 'false');

    await user.click(card('Drive'));
    expect(editor().tool).toEqual({ type: 'select' });
    expect(card('Drive')).toHaveAttribute('aria-pressed', 'false');
  });

  it('places the item when the active card is pressed with Enter, and keeps placing with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<Palette />);
    card('Drive').focus();

    await user.keyboard('{Enter}');
    expect(editor().tool).toMatchObject({ type: 'place', kind: 'drive' });

    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(editor().items.map((item) => item.tag)).toEqual(['VFD-01']);
    expect(editor().tool).toMatchObject({ type: 'place', kind: 'drive' });

    await user.keyboard('{Enter}');
    expect(editor().items.map((item) => item.tag)).toEqual(['VFD-01', 'VFD-02']);
    expect(editor().tool).toEqual({ type: 'select' });
    expect(card('Drive')).toHaveFocus();
  });

  it('keeps placing after each item when the card is Shift+clicked', async () => {
    const user = userEvent.setup();
    render(<Palette />);

    await user.keyboard('{Shift>}');
    await user.click(card('Transformer'));
    await user.keyboard('{/Shift}');

    expect(editor().tool).toEqual({
      type: 'place',
      kind: 'transformer',
      rotation: 0,
      sticky: true,
    });
  });

  it('switches to another type while placing', async () => {
    const user = userEvent.setup();
    render(<Palette />);

    await user.click(card('Cabinet'));
    await user.click(card('UPS'));

    expect(editor().tool).toMatchObject({ type: 'place', kind: 'ups' });
    expect(card('UPS')).toHaveAttribute('aria-pressed', 'true');
    expect(card('Cabinet')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the active type when placement starts from the keyboard', () => {
    render(<Palette />);

    act(() => {
      startPlacement('ups');
    });

    expect(card('UPS')).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the hotkeys while single-key shortcuts are off', () => {
    useShortcutStore.setState({ singleKeys: false });
    render(<Palette />);

    expect(card('Cabinet')).not.toHaveAttribute('aria-keyshortcuts');
    expect(within(tileOf(card('Cabinet'))).queryByText('1')).not.toBeInTheDocument();
  });

  it('shows names, sizes and details in Vietnamese', () => {
    setLocale('vi');
    render(<Palette />);

    expect(screen.getByRole('heading', { name: 'Thiết bị' })).toBeInTheDocument();
    const transformer = card('Máy biến áp');
    expect(transformer).toHaveAccessibleDescription('Rộng 1,50 m, sâu 1,00 m, cao 1,80 m');
    const tile = tileOf(transformer);
    expect(within(tile).getByText('1,50')).toBeInTheDocument();
    expect(within(tile).getByText('1,00')).toBeInTheDocument();
    expect(within(tile).getByText('1,80 m')).toBeInTheDocument();
    expect(transformer).toHaveAttribute('title', 'Máy biến áp khô · mã LE-TRF-1510');
    expect(
      screen.getByText('Di chuyển bằng phím mũi tên, đặt bằng Enter. Giữ Shift để đặt liên tục.'),
    ).toBeInTheDocument();
  });
});
