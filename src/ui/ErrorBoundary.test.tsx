import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Viewport({ fail }: { readonly fail: boolean }) {
  if (fail) throw new Error('WebGL context lost');
  return <p>Viewport ready</p>;
}

function Guarded({ fail }: { readonly fail: boolean }) {
  return (
    <ErrorBoundary fallback={() => <p>Viewport failed</p>}>
      <Viewport fail={fail} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary', () => {
  test('shows the fallback when a child throws, and keeps showing it after the child recovers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(<Guarded fail />);
    expect(screen.getByText('Viewport failed')).toBeInTheDocument();
    expect(screen.queryByText('Viewport ready')).not.toBeInTheDocument();
    rerender(<Guarded fail={false} />);
    expect(screen.getByText('Viewport failed')).toBeInTheDocument();
    expect(screen.queryByText('Viewport ready')).not.toBeInTheDocument();
  });

  test('renders the children when nothing fails', () => {
    render(<Guarded fail={false} />);
    expect(screen.getByText('Viewport ready')).toBeInTheDocument();
  });

  test('reports the error to the console', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Guarded fail />);
    const logged = consoleError.mock.calls
      .flat()
      .some((value: unknown) => value instanceof Error && value.message === 'WebGL context lost');
    expect(logged).toBe(true);
  });
});
