import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Field, TextInput } from './Field';

describe('Field', () => {
  test('labels its control', () => {
    render(<Field label="Tag">{(control) => <TextInput {...control} />}</Field>);
    expect(screen.getByLabelText('Tag')).toBe(screen.getByRole('textbox'));
  });

  test('an error marks the control invalid and describes it', () => {
    render(
      <Field label="Tag" error="VFD-02 is already used by another item.">
        {(control) => <TextInput {...control} />}
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Tag' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('VFD-02 is already used by another item.');
  });

  test('an empty error counts as no error: nothing is described and the control is not invalid', () => {
    render(
      <Field label="Tag" error="">
        {(control) => <TextInput {...control} />}
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Tag' });
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toBeValid();
  });

  test('without an error nothing is referenced', () => {
    render(<Field label="Tag">{(control) => <TextInput {...control} />}</Field>);
    const input = screen.getByRole('textbox', { name: 'Tag' });
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  test('a plain control that spreads the wiring is labelled, described and marked invalid too', () => {
    render(
      <Field label="Rotation note" error="Pick a quarter turn.">
        {(control) => <select {...control} />}
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Rotation note' });
    expect(select).toHaveAccessibleDescription('Pick a quarter turn.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  test('every field gets its own ids', () => {
    render(
      <>
        <Field label="X" error="Out of the room">
          {(control) => <TextInput {...control} />}
        </Field>
        <Field label="Z" error="Out of the room">
          {(control) => <TextInput {...control} />}
        </Field>
      </>,
    );
    const x = screen.getByLabelText('X');
    const z = screen.getByLabelText('Z');
    expect(x.id).not.toBe(z.id);
    expect(x.getAttribute('aria-describedby')).not.toBe(z.getAttribute('aria-describedby'));
  });
});

describe('TextInput', () => {
  test('passes native props, the ref and extra classes through', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} aria-label="Filter" className="extra" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Filter' });
    expect(ref.current).toBe(input);
    expect(input).toHaveClass('extra');
    expect(input.classList).toHaveLength(2);
    await user.type(input, 'cab');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(input).toHaveValue('cab');
  });
});
