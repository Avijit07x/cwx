import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleLayout } from '../../domain/seed';
import { addItem, setLocale } from '../../state/actions';
import { resetEditor } from '../../state/store';
import { BomPanel } from './BomPanel';

const COLLAPSED_KEY = 'layout-editor:v1:bom-collapsed';

function table(): HTMLElement {
  return screen.getByRole('table', { name: /Equipment counted from the layout/ });
}

function cellsOf(row: HTMLElement): (string | null)[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
}

const toggle = () => screen.getByRole('button', { name: 'Show or hide the table' });

beforeEach(() => {
  resetEditor(sampleLayout());
  window.localStorage.clear();
});

describe('BomPanel', () => {
  it('counts each item type from the layout with prices and totals', () => {
    render(<BomPanel />);
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Item', 'Part no.', 'Unit price', 'Quantity', 'Line total']);
    expect(cellsOf(within(table()).getByRole('row', { name: /^Switchgear cabinet/ }))).toEqual([
      'LE-SWG-1005',
      '$4,800.00',
      '4',
      '$19,200.00',
    ]);
    expect(cellsOf(within(table()).getByRole('row', { name: /^Dry-type transformer/ }))).toEqual([
      'LE-TRF-1510',
      '$18,500.00',
      '2',
      '$37,000.00',
    ]);
    expect(cellsOf(within(table()).getByRole('row', { name: /^Total/ }))).toEqual([
      '12',
      '$89,000.00',
    ]);
    expect(screen.getByText('12 items · $89,000.00')).toBeInTheDocument();
    expect(screen.getByText('Prices are illustrative, in USD.')).toBeInTheDocument();
  });

  it('updates when items are added', () => {
    render(<BomPanel />);
    act(() => {
      addItem('drive', { x: 12, z: 6 });
    });
    expect(
      cellsOf(within(table()).getByRole('row', { name: /^Variable frequency drive/ })),
    ).toEqual(['LE-VFD-0505', '$3,250.00', '5', '$16,250.00']);
    expect(screen.getByText('13 items · $92,250.00')).toBeInTheDocument();
  });

  it('switches headers, names, numbers and currency to Vietnamese', () => {
    render(<BomPanel />);
    act(() => {
      setLocale('vi');
    });
    const viTable = screen.getByRole('table', { name: /Thiết bị được đếm từ bố trí/ });
    expect(
      within(viTable)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Thiết bị', 'Mã hàng', 'Đơn giá', 'Số lượng', 'Thành tiền']);
    const cabinet = within(viTable).getByRole('row', { name: /^Tủ đóng cắt/ });
    expect(within(cabinet).getAllByRole('cell')[1]).toHaveTextContent('4.800,00 US$');
    expect(within(cabinet).getAllByRole('cell')[3]).toHaveTextContent('19.200,00 US$');
    expect(within(viTable).getByRole('row', { name: /^Tổng cộng/ })).toHaveTextContent(
      '89.000,00 US$',
    );
    expect(screen.getByText('12 thiết bị · 89.000,00 US$')).toBeInTheDocument();
    expect(screen.getByText('Giá chỉ mang tính minh họa, tính bằng USD.')).toBeInTheDocument();
  });

  it('puts the table in a named region that keyboard users can focus to scroll it', async () => {
    const user = userEvent.setup();
    render(<BomPanel />);
    const region = screen.getByRole('region', { name: /^Equipment counted from the layout/ });
    expect(region).toContainElement(table());
    expect(region).toHaveAttribute('tabindex', '0');

    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.tab();
    expect(region).toHaveFocus();
  });

  it('shows an empty state when nothing is placed', () => {
    resetEditor([]);
    render(<BomPanel />);
    expect(screen.getByText('No equipment yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('0 items · $0.00')).toBeInTheDocument();
  });

  it('collapses to its summary and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BomPanel />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.getElementById(toggle().getAttribute('aria-controls') ?? '')).not.toBeVisible();
    expect(screen.getByText('12 items · $89,000.00')).toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe('true');

    unmount();
    render(<BomPanel />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle());
    expect(table()).toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe('false');
  });

  it('still collapses when browser storage is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<BomPanel />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });
});
