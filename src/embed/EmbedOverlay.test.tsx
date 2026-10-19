import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../state/actions';
import { DEFAULT_SESSION, resetEditor, useEditor } from '../state/store';
import { startHostBridge, useEmbed } from './bridge';
import { EmbedOverlay } from './EmbedOverlay';
import type { InitPayload } from './protocol';
import { ALLOWED_ORIGINS, frameInFakeHost, HOST_ORIGIN } from '../test/fakeHost';

const NOW = Date.UTC(2026, 9, 18, 9, 0, 0);
let stop: () => void = () => undefined;
let projectSeq = 0;

function initPayload(): InitPayload {
  projectSeq += 1;
  return {
    user: { id: 'u-1042', name: 'Alex Morgan' },
    project: { id: `prj-overlay-${projectSeq}`, name: 'Harbor plant · Electrical room B' },
    locale: 'en',
    token: 'tok_OVERLAY-1',
    tokenExpiresAt: Date.now() + 120_000,
  };
}

function asDialog(element: HTMLElement): HTMLDialogElement {
  if (!(element instanceof HTMLDialogElement)) throw new Error('Expected a <dialog> element');
  return element;
}

beforeEach(() => {
  resetEditor();
  useEditor.setState({ session: { ...DEFAULT_SESSION, embedded: true }, saveStatus: 'off' });
  useEmbed.setState({ status: 'waiting' }, true);
  localStorage.clear();
});

afterEach(() => {
  stop();
  stop = () => undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expireToken(): void {
  act(() => {
    useEmbed.setState({ status: 'expired', hostOrigin: HOST_ORIGIN, tokenExpiresAt: NOW }, true);
  });
}

describe('EmbedOverlay', () => {
  it('blocks the editor with a modal connecting dialog while waiting for the host', () => {
    render(<EmbedOverlay />);

    const dialog = screen.getByRole('dialog', { name: 'Connecting to the host application…' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription(
      'Waiting for the project and user details from the host.',
    );
  });

  it('keeps the blocking dialog open when Escape or the browser tries to close it', () => {
    render(<EmbedOverlay />);
    const dialog = asDialog(screen.getByRole('dialog'));

    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);

    dialog.close();
    expect(dialog).toHaveAttribute('open');
  });

  it('explains a host that did not respond and offers a reload', () => {
    useEmbed.setState({ status: 'error', reason: 'init-timeout' }, true);
    render(<EmbedOverlay />);

    const dialog = screen.getByRole('alertdialog', {
      name: 'Can’t connect to the host application',
    });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription(/did not respond in time/);
    expect(within(dialog).getByText('Error code: init-timeout')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Reload editor' })).toBeInTheDocument();
  });

  it('explains that the editor only runs inside an approved host', () => {
    useEmbed.setState({ status: 'error', reason: 'no-host' }, true);
    render(<EmbedOverlay />);

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /only runs inside an approved host application/,
    );
    expect(screen.getByText('Error code: no-host')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a corner badge with a live token countdown once connected', () => {
    vi.useFakeTimers({ now: NOW });
    render(<EmbedOverlay />);
    const dialog = screen.getByRole('dialog');

    act(() => {
      useEmbed.setState(
        { status: 'connected', hostOrigin: HOST_ORIGIN, tokenExpiresAt: NOW + 120_000 },
        true,
      );
    });

    expect(dialog).not.toBeInTheDocument();
    const badge = screen.getByRole('region', { name: 'Host connection' });
    expect(within(badge).getByText('Embedded')).toBeInTheDocument();
    expect(within(badge).getByText('Token valid for 2:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(badge).toHaveTextContent('Token valid for 1:59');
    act(() => {
      vi.advanceTimersByTime(118_500);
    });
    expect(badge).toHaveTextContent('Token valid for 0:01');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(badge).toHaveTextContent('Token valid for 0:00');
  });

  it('restarts the countdown from the full lifetime when a new token arrives mid-second', () => {
    vi.useFakeTimers({ now: NOW });
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    act(() => {
      host.send({ type: 'init', payload: initPayload() });
    });
    render(<EmbedOverlay />);
    const quote = screen.getByRole('button', { name: 'Send BOM to quote' });
    quote.focus();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      host.send({
        type: 'token',
        payload: { token: 'tok_ROTATED-1', tokenExpiresAt: Date.now() + 120_000 },
      });
    });

    expect(screen.getByText('Token valid for 2:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send BOM to quote' })).toHaveFocus();
  });

  it('sends the bill of materials to the host for a quote and confirms it', async () => {
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    const payload = initPayload();
    host.send({ type: 'init', payload });
    render(<EmbedOverlay />);
    host.clear();

    await userEvent.click(screen.getByRole('button', { name: 'Send BOM to quote' }));

    expect(host.sentOfType('navigate')).toEqual([
      { type: 'navigate', payload: { to: 'quote', projectId: payload.project.id } },
    ]);
    expect(toast.getToasts()).toContainEqual(
      expect.objectContaining({
        type: 'success',
        title: 'Bill of materials sent to the host application for a quote.',
      }),
    );
  });

  it('replaces the badge with an expiry alert when access expires, and restores it on renewal', () => {
    vi.useFakeTimers({ now: NOW });
    const host = frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    render(<EmbedOverlay />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Connecting to the host application…');

    act(() => {
      host.send({ type: 'init', payload: initPayload() });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send BOM to quote' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Access expired. Waiting for the host application to renew it.',
    );
    expect(screen.queryByRole('button', { name: 'Send BOM to quote' })).not.toBeInTheDocument();

    act(() => {
      host.send({
        type: 'token',
        payload: { token: 'tok_RENEWED-2', tokenExpiresAt: Date.now() + 120_000 },
      });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Host connection' })).toHaveTextContent(
      'Token valid for 2:00',
    );
  });

  it('keeps keyboard focus in the overlay when access expires and is renewed while it has focus', () => {
    useEmbed.setState(
      { status: 'connected', hostOrigin: HOST_ORIGIN, tokenExpiresAt: NOW + 120_000 },
      true,
    );
    render(<EmbedOverlay />);
    screen.getByRole('button', { name: 'Send BOM to quote' }).focus();

    expireToken();
    expect(screen.getByRole('alert')).toHaveFocus();

    act(() => {
      useEmbed.setState(
        { status: 'connected', hostOrigin: HOST_ORIGIN, tokenExpiresAt: NOW + 240_000 },
        true,
      );
    });
    expect(screen.getByRole('button', { name: 'Send BOM to quote' })).toHaveFocus();
  });

  it('leaves keyboard focus where it is when access expires while focus is elsewhere', () => {
    useEmbed.setState(
      { status: 'connected', hostOrigin: HOST_ORIGIN, tokenExpiresAt: NOW + 120_000 },
      true,
    );
    render(
      <>
        <button type="button">Elsewhere</button>
        <EmbedOverlay />
      </>,
    );
    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    expireToken();

    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });

  it('turns into the timeout error when the host never sends init', () => {
    vi.useFakeTimers({ now: NOW });
    frameInFakeHost();
    stop = startHostBridge(ALLOWED_ORIGINS);
    render(<EmbedOverlay />);

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(/did not respond in time/);
  });

  it('follows the editor language', () => {
    setLocale('vi');
    useEmbed.setState(
      { status: 'connected', hostOrigin: HOST_ORIGIN, tokenExpiresAt: Date.now() + 120_000 },
      true,
    );
    render(<EmbedOverlay />);

    const badge = screen.getByRole('region', { name: 'Kết nối với ứng dụng chủ' });
    expect(within(badge).getByText('Chế độ nhúng')).toBeInTheDocument();
    expect(within(badge).getByText(/^Mã truy cập còn hiệu lực [12]:\d\d$/)).toBeInTheDocument();
    expect(within(badge).getByRole('button', { name: 'Gửi BOM để báo giá' })).toBeInTheDocument();
  });
});
