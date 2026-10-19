import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { EmptyState } from './EmptyState';
import { CheckCircleIcon } from './icons';

describe('EmptyState', () => {
  test('shows the title, and the icon and explanation only when given', () => {
    const { container, rerender } = render(
      <EmptyState icon={<CheckCircleIcon />} title="No clearance issues" tone="success">
        <p>Every item meets the 0.60 m clearance.</p>
      </EmptyState>,
    );
    expect(screen.getByText('No clearance issues')).toBeInTheDocument();
    expect(screen.getByText('Every item meets the 0.60 m clearance.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<EmptyState title="No items yet" />);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText('Every item meets the 0.60 m clearance.')).not.toBeInTheDocument();
  });
});
