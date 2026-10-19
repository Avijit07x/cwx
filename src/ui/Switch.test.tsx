import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Switch } from './Switch';

function Harness({
  onChange,
  disabled,
}: {
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  const [checked, setChecked] = useState(true);
  return (
    <>
      <Switch
        id="sound"
        checked={checked}
        disabled={disabled}
        aria-describedby="sound-hint"
        onCheckedChange={(next) => {
          setChecked(next);
          onChange(next);
        }}
      />
      <label htmlFor="sound">Sound</label>
      <p id="sound-hint">Plays a click</p>
    </>
  );
}

describe('Switch', () => {
  test('is a native button with the switch role, named by its label and showing its state', () => {
    render(<Harness onChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Sound' });

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute('data-checked');
    expect(toggle).toHaveAccessibleDescription('Plays a click');
  });

  test('toggles from a click, a click on its label and the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Sound' });

    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute('data-unchecked');
    await user.keyboard('{Enter}');
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(screen.getByText('Sound'));
    expect(toggle).toBeChecked();
    expect(onChange.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  test('ignores clicks and keys while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} disabled />);
    const toggle = screen.getByRole('switch', { name: 'Sound' });

    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('data-disabled');
    await user.click(toggle);
    await user.click(screen.getByText('Sound'));
    await user.tab();
    expect(toggle).not.toHaveFocus();
    expect(toggle).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });
});
