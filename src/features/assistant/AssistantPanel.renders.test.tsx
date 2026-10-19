import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../state/queryClient';
import { resetEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { AssistantPanel } from './AssistantPanel';

const cards = vi.hoisted(() => ({ renders: 0 }));

vi.mock('./ProposalCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ProposalCard')>();
  return {
    ...actual,
    ProposalCard: (props: ComponentProps<typeof actual.ProposalCard>) => {
      cards.renders += 1;
      return <actual.ProposalCard {...props} />;
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  resetEditor([
    makeItem({ kind: 'drive', tag: 'VFD-01', x: 2.25, z: 2.25 }),
    makeItem({ kind: 'drive', tag: 'VFD-02', x: 2.75, z: 2.25 }),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

it('typing in the message box leaves the conversation alone', async () => {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AssistantPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Fix clearance issues' }));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(screen.getByRole('group', { name: 'Proposed change' })).toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: 'Message to the assistant' });
  cards.renders = 0;

  for (const draft of ['M', 'Mo', 'Mov', 'Move']) {
    fireEvent.change(input, { target: { value: draft } });
  }

  expect(input).toHaveValue('Move');
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  expect(cards.renders).toBe(0);
});
