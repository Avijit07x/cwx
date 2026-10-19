import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useEmbed } from './embed/bridge';
import { announce, notify, setInspectorTab, setLocale } from './state/actions';
import { DEFAULT_SESSION, resetEditor, useEditor } from './state/store';

function renderApp() {
  return render(<App />);
}

vi.mock('./viewport/Viewport', () => ({ default: () => null }));

beforeEach(() => {
  resetEditor();
  useEmbed.setState({ status: 'waiting' }, true);
});

describe('App', () => {
  it('shows the host connection only in an embedded session, as the last part of the inspector', () => {
    renderApp();

    expect(screen.queryByText('Connecting to the host application…')).not.toBeInTheDocument();

    act(() => {
      useEditor.setState({ session: { ...DEFAULT_SESSION, embedded: true } });
    });

    expect(screen.getByText('Connecting to the host application…')).toBeInTheDocument();

    act(() => {
      useEmbed.setState(
        {
          status: 'connected',
          hostOrigin: 'https://host.example',
          tokenExpiresAt: Date.now() + 120_000,
        },
        true,
      );
    });

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector.lastElementChild).toBe(
      screen.getByRole('region', { name: 'Host connection' }),
    );
  });

  it('the inspector tabs follow the store both ways and keep the hidden panel mounted', async () => {
    const user = userEvent.setup();
    renderApp();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const tabs = within(inspector).getByRole('tablist', { name: 'Inspector' });
    expect(within(tabs).getByRole('tab', { name: 'Inspect' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(inspector.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);

    act(() => {
      setInspectorTab('assistant');
    });
    expect(within(tabs).getByRole('tab', { name: 'Assistant' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(inspector).getByRole('tabpanel')).toHaveAccessibleName('Assistant');

    await user.click(within(tabs).getByRole('tab', { name: 'Inspect' }));
    expect(useEditor.getState().inspectorTab).toBe('inspect');
    expect(inspector.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
  });

  it('loads the assistant panel on its own, with the query client it needs', async () => {
    renderApp();
    act(() => {
      setInspectorTab('assistant');
    });
    expect(
      await screen.findByRole('textbox', { name: 'Message to the assistant' }),
    ).toBeInTheDocument();
  });

  it('mounts one polite and one assertive notification region', () => {
    renderApp();
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByRole('region', { name: 'Error notifications' })).toHaveAttribute(
      'aria-live',
      'assertive',
    );
  });

  it('puts announcements in the live region and errors in the assertive toaster, in the current language', async () => {
    renderApp();
    act(() => {
      announce('Selection cleared.');
      notify('error', 'Could not save');
    });
    expect(screen.getByTestId('live-region')).toHaveTextContent('Selection cleared.');
    expect(
      await within(screen.getByRole('region', { name: 'Error notifications' })).findByText(
        'Could not save',
      ),
    ).toBeInTheDocument();
    act(() => {
      setLocale('vi');
    });
    expect(screen.getByRole('region', { name: 'Thông báo lỗi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng thông báo' })).toBeInTheDocument();
  });
});
