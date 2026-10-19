import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Section } from './Section';

describe('Section', () => {
  test('is a region named by its level-2 heading', () => {
    render(
      <Section title="Equipment">
        <p>Four item types</p>
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Equipment' });
    expect(
      within(region).getByRole('heading', { level: 2, name: 'Equipment' }),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent('Four item types');
  });

  test('shows meta and actions only when given', () => {
    const { rerender } = render(
      <Section title="Placed items" meta="12" actions={<button type="button">Collapse</button>} />,
    );
    const region = screen.getByRole('region', { name: 'Placed items' });
    expect(within(region).getByText('12')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    rerender(<Section title="Placed items" />);
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('each section gets its own heading id', () => {
    render(
      <>
        <Section title="Rule check" />
        <Section title="Bill of materials" />
      </>,
    );
    const first = screen.getByRole('region', { name: 'Rule check' });
    const second = screen.getByRole('region', { name: 'Bill of materials' });
    expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'));
  });
});
