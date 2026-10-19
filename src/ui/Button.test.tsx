import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type SubmitEvent } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Button, IconButton } from './Button';
import { GaugeIcon, UndoIcon } from './icons';
import { TooltipProvider } from './Tooltip';

describe('Button', () => {
  test('defaults to type="button", so it never submits a surrounding form by accident', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button>Save</Button>
        <Button type="submit">Send</Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('shows its icon hidden from assistive technology next to the label', () => {
    render(<Button icon={<UndoIcon />}>Undo</Button>);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('passes native props through and ignores clicks while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button onClick={onClick} variant="danger" size="sm" className="extra" disabled>
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('extra');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    rerender(
      <Button onClick={onClick} variant="danger" size="sm">
        Delete
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  test('is named by its label and exposes its shortcut', () => {
    render(
      <IconButton label="Undo" icon={<UndoIcon />} shortcut="Ctrl+Z" ariaShortcut="Control+Z" />,
    );
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+Z');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('keyboard focus shows the tooltip with the shortcut at once, and Escape hides it', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Undo" icon={<UndoIcon />} shortcut="Ctrl+Z" />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    expect(await screen.findByText('Undo · Ctrl+Z')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => {
      expect(screen.queryByText('Undo · Ctrl+Z')).not.toBeInTheDocument();
    });
  });

  test('hovering shows the tooltip after the shared short delay', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <IconButton label="Statistics" icon={<GaugeIcon />} />
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: 'Statistics' }));
    expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
    expect(await screen.findByText('Statistics')).toBeInTheDocument();
  });

  test('reports its pressed state when used as a toggle', () => {
    const { rerender } = render(
      <IconButton label="Statistics" icon={<GaugeIcon />} pressed={false} />,
    );
    expect(screen.getByRole('button', { name: 'Statistics', pressed: false })).toBeInTheDocument();
    rerender(<IconButton label="Statistics" icon={<GaugeIcon />} pressed />);
    expect(screen.getByRole('button', { name: 'Statistics', pressed: true })).toBeInTheDocument();
  });

  test('the tooltip falls back to the label and can be switched off', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<IconButton label="Focus" icon={<GaugeIcon />} />);
    await user.tab();
    expect(await screen.findByText('Focus')).toBeInTheDocument();
    unmount();
    render(<IconButton label="Focus" icon={<GaugeIcon />} tooltip="none" />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Focus' });
    expect(button).toHaveFocus();
    expect(screen.queryByText('Focus')).not.toBeInTheDocument();
  });

  test('passes the ref and native props to the button under the tooltip', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton label="Delete" icon={<UndoIcon />} ref={ref} aria-haspopup="dialog" disabled />,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toBeDisabled();
  });

  test('clicks reach the handler unless the button is disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<IconButton label="Undo" icon={<UndoIcon />} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    rerender(<IconButton label="Undo" icon={<UndoIcon />} onClick={onClick} disabled />);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
