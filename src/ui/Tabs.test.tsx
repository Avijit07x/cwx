import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { TabPanel, Tabs, type TabDef } from './Tabs';

type Pane = 'inspect' | 'assistant' | 'history';

const TABS: readonly TabDef<Pane>[] = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'history', label: 'History' },
];

function Harness({ onChange }: { readonly onChange?: (pane: Pane) => void }) {
  const [value, setValue] = useState<Pane>('inspect');
  return (
    <>
      <button type="button">Before</button>
      <Tabs
        label="Inspector"
        tabs={TABS}
        value={value}
        onChange={(pane) => {
          setValue(pane);
          onChange?.(pane);
        }}
      >
        {TABS.map((tab) => (
          <TabPanel key={tab.id} value={tab.id}>
            <p>{tab.id} panel</p>
            <input aria-label={`${tab.id} note`} />
          </TabPanel>
        ))}
      </Tabs>
      <button type="button">After</button>
    </>
  );
}

function tab(name: string | RegExp): HTMLElement {
  return screen.getByRole('tab', { name });
}

describe('Tabs', () => {
  test('is a labelled ARIA tablist whose selected tab controls the visible panel', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tab('Inspect')).toHaveAttribute('aria-selected', 'true');
    expect(tab('History')).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('inspect panel');
    expect(tab('Inspect')).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAccessibleName('Inspect');
  });

  test('only the selected tab is in the tab order, followed by its panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(tab('Inspect')).toHaveAttribute('tabindex', '0');
    expect(tab('History')).toHaveAttribute('tabindex', '-1');
    await user.click(screen.getByRole('button', { name: 'Before' }));
    await user.tab();
    expect(tab('Inspect')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'inspect note' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  test('clicking a tab selects it and shows its panel', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(tab('History'));
    expect(onChange).toHaveBeenCalledWith('history');
    expect(tab('History')).toHaveAttribute('aria-selected', 'true');
    expect(tab('History')).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('history panel');
  });

  test('arrow keys move selection and focus, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab('Inspect'));
    await user.keyboard('{ArrowRight}');
    expect(tab(/assistant/i)).toHaveFocus();
    expect(tab(/assistant/i)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(tab('Inspect')).toHaveFocus();
    expect(tab('Inspect')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(tab('History')).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('history panel');
  });

  test('Home and End jump to the first and last tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab(/assistant/i));
    await user.keyboard('{End}');
    expect(tab('History')).toHaveFocus();
    expect(tab('History')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(tab('Inspect')).toHaveFocus();
    expect(tab('Inspect')).toHaveAttribute('aria-selected', 'true');
  });

  test('keys the tabs handle are marked handled, so global shortcuts skip them; other keys are not', () => {
    render(<Harness />);
    expect(fireEvent.keyDown(tab('Inspect'), { key: 'ArrowRight' })).toBe(false);
    expect(fireEvent.keyDown(tab('Inspect'), { key: 'End' })).toBe(false);
    expect(fireEvent.keyDown(tab('Inspect'), { key: 'r' })).toBe(true);
  });

  test('hidden panels stay mounted, so their state survives a tab switch', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: 'inspect note' }), 'CAB-01');
    await user.click(tab('History'));
    expect(screen.queryByRole('textbox', { name: 'inspect note' })).not.toBeInTheDocument();
    await user.click(tab('Inspect'));
    expect(screen.getByRole('textbox', { name: 'inspect note' })).toHaveValue('CAB-01');
  });
});
