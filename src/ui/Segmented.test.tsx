import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import type { Rotation } from '../domain/types';
import { Segmented, type SegmentedOption } from './Segmented';

const OPTIONS: readonly SegmentedOption<Rotation>[] = [
  { value: 0, label: '0°', title: 'Front faces south' },
  { value: 90, label: '90°' },
  { value: 180, label: '180°' },
  { value: 270, label: '270°' },
];

function Harness({
  onChange,
  disabled,
  legend = 'Rotation',
}: {
  readonly onChange: (value: Rotation) => void;
  readonly disabled?: boolean;
  readonly legend?: string;
}) {
  const [value, setValue] = useState<Rotation>(0);
  return (
    <Segmented
      legend={legend}
      options={OPTIONS}
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('Segmented', () => {
  test('is a radio group named by its legend, with the current value checked', () => {
    render(<Harness onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Rotation' });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: '0°' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '90°' })).not.toBeChecked();
  });

  test('choosing an option reports its value with its original type', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByText('180°'));
    expect(onChange).toHaveBeenCalledWith(180);
    expect(screen.getByRole('radio', { name: '180°' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '0°' })).not.toBeChecked();
  });

  test('only the checked option is in the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: '0°' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  test('arrow keys move through the options like any radio group, wrapping around', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '0°' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '90°' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '90°' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '270°' })).toBeChecked();
    expect(onChange.mock.calls).toEqual([[90], [0], [270]]);
  });

  test('arrow keys are marked handled, so global shortcuts skip them', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(
      fireEvent.keyDown(screen.getByRole('radio', { name: '0°' }), { key: 'ArrowRight' }),
    ).toBe(false);
  });

  test('separate controls keep separate values', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness onChange={vi.fn()} legend="Rotation" />
        <Harness onChange={vi.fn()} legend="View" />
      </>,
    );
    const rotation = screen.getByRole('radiogroup', { name: 'Rotation' });
    const view = screen.getByRole('radiogroup', { name: 'View' });
    await user.click(within(rotation).getByRole('radio', { name: '90°' }));
    expect(within(rotation).getByRole('radio', { name: '90°' })).toBeChecked();
    expect(within(view).getByRole('radio', { name: '0°' })).toBeChecked();
    expect(within(view).getByRole('radio', { name: '90°' })).not.toBeChecked();
  });

  test('disabled disables every option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} disabled />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-disabled', 'true');
    }
    await user.click(screen.getByText('90°'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '0°' })).toBeChecked();
  });

  test('an option title opens the shared tooltip on keyboard focus, not a native title', async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: '0°' })).toHaveFocus();
    expect(await screen.findByText('Front faces south')).toBeInTheDocument();
    expect(screen.queryByTitle('Front faces south')).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    await vi.waitFor(() => {
      expect(screen.queryByText('Front faces south')).not.toBeInTheDocument();
    });
  });
});
