import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { describe, expect, test, vi } from 'vitest';
import { Toaster } from './Toaster';

const ALERTS = 'alerts';
const EN = {
  notifications: 'Notifications',
  errorNotifications: 'Error notifications',
  dismiss: 'Dismiss notification',
};
const VI = {
  notifications: 'Thông báo',
  errorNotifications: 'Thông báo lỗi',
  dismiss: 'Đóng thông báo',
};

function politeRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Notifications' });
}

function alertRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Error notifications' });
}

describe('Toaster', () => {
  test('has a polite region and an assertive region ready before any notice arrives', () => {
    render(<Toaster alertId={ALERTS} labels={EN} />);
    expect(politeRegion()).toHaveAttribute('aria-live', 'polite');
    expect(alertRegion()).toHaveAttribute('aria-live', 'assertive');
    expect(politeRegion()).toBeEmptyDOMElement();
    expect(alertRegion()).toBeEmptyDOMElement();
  });

  test('notices sent to the alert toaster go to the assertive region, other notices to the polite region', async () => {
    render(<Toaster alertId={ALERTS} labels={EN} />);
    act(() => {
      toast.info('Draft restored');
      toast.success('Change applied');
      toast.error('Could not save', { toasterId: ALERTS });
    });
    expect(await within(alertRegion()).findByText('Could not save')).toBeInTheDocument();
    expect(within(politeRegion()).getByText('Draft restored')).toBeInTheDocument();
    expect(within(politeRegion()).getByText('Change applied')).toBeInTheDocument();
    expect(within(alertRegion()).queryByText('Draft restored')).not.toBeInTheDocument();
    expect(within(politeRegion()).queryByText('Could not save')).not.toBeInTheDocument();
  });

  test('the dismiss button removes its notice', async () => {
    const user = userEvent.setup();
    render(<Toaster alertId={ALERTS} labels={EN} />);
    act(() => {
      toast.info('Draft restored');
    });
    await user.click(await screen.findByRole('button', { name: 'Dismiss notification' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('Draft restored')).not.toBeInTheDocument();
    });
    expect(toast.getToasts()).toEqual([]);
  });

  test('the region and dismiss labels come from the caller', async () => {
    render(<Toaster alertId={ALERTS} labels={VI} />);
    act(() => {
      toast.info('Đã khôi phục bản nháp gần nhất.');
    });
    expect(await screen.findByRole('button', { name: 'Đóng thông báo' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Thông báo lỗi' })).toBeInTheDocument();
  });
});
