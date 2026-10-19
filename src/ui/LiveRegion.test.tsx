import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { LiveRegion } from './LiveRegion';

describe('LiveRegion', () => {
  test('is a polite, atomic live region that starts empty', () => {
    render(<LiveRegion announcement={null} />);
    const region = screen.getByTestId('live-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toBeEmptyDOMElement();
  });

  test('shows only the latest announcement', () => {
    const { rerender } = render(
      <LiveRegion announcement={{ id: 1, text: 'CAB-01 moved to X 6.00 m, Z 4.75 m.' }} />,
    );
    const region = screen.getByTestId('live-region');
    expect(region).toHaveTextContent('CAB-01 moved to X 6.00 m, Z 4.75 m.');
    rerender(<LiveRegion announcement={{ id: 2, text: 'Selection cleared.' }} />);
    expect(region).toHaveTextContent(/^Selection cleared\.$/);
    expect(region.childElementCount).toBe(1);
  });

  test('repeating the same text replaces the node so screen readers read it again', () => {
    const { rerender } = render(<LiveRegion announcement={{ id: 1, text: 'Nothing to undo.' }} />);
    const region = screen.getByTestId('live-region');
    const first = region.firstElementChild;
    rerender(<LiveRegion announcement={{ id: 2, text: 'Nothing to undo.' }} />);
    expect(region).toHaveTextContent('Nothing to undo.');
    expect(region.firstElementChild).not.toBe(first);
  });
});
