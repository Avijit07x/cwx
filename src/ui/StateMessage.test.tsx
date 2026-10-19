import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { StateMessage } from './StateMessage';

describe('StateMessage', () => {
  test('shows a problem as an alert with its explanation and action', () => {
    const reload = vi.fn();
    render(
      <StateMessage
        role="alert"
        title="The 3D view stopped drawing"
        body="Your layout is safe."
        action={<button onClick={reload}>Reload 3D view</button>}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The 3D view stopped drawingYour layout is safe.');
    expect(alert.querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload 3D view' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('a progress message is a status without the warning icon', () => {
    render(<StateMessage role="status" warning={false} title="Loading 3D view…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading 3D view…');
    expect(status.querySelector('svg')).toBeNull();
  });
});
