import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findViolations } from '../../domain/rules';
import type { PlacedItem } from '../../domain/types';
import { UNDO_SHORTCUT } from '../../platform';
import { moveItem, select, setLocale, undo } from '../../state/actions';
import { ASSISTANT_REPLY_KEY, createQueryClient } from '../../state/queryClient';
import { resetEditor, useEditor } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { useKeyboardShortcuts } from '../shortcuts/useKeyboardShortcuts';
import { AssistantPanel } from './AssistantPanel';
import { CHUNK_DELAY_MS, streamAssistantReply, type AssistantTransport } from './mockAgent';

const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 10, z: 6.25 });

const layout: readonly PlacedItem[] = [
  makeItem({ kind: 'drive', tag: 'VFD-01', x: 2.25, z: 2.25 }),
  makeItem({ kind: 'drive', tag: 'VFD-02', x: 2.75, z: 2.25 }),
  cabinet,
  makeItem({ kind: 'cabinet', tag: 'CAB-02', x: 11, z: 6.25 }),
];

let queryClient: QueryClient;

function renderPanel(ui: ReactElement = <AssistantPanel />) {
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function assistantRequests() {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: ASSISTANT_REPLY_KEY })
    .map((mutation) => mutation.state.status);
}

function PanelWithShortcuts() {
  useKeyboardShortcuts();
  return <AssistantPanel />;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function finishStreaming() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function messageBox() {
  return screen.getByRole('textbox', { name: 'Message to the assistant' });
}

function conversation() {
  return screen.getByRole('log', { name: 'Conversation' });
}

function proposalCards() {
  return screen.getAllByRole('group', { name: 'Proposed change' });
}

function lastCard(): HTMLElement {
  const card = proposalCards().at(-1);
  if (!card) throw new Error('Expected a proposal card');
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetEditor(layout);
  queryClient = createQueryClient();
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('AssistantPanel', () => {
  it('labels itself as simulated and starts with suggestions', () => {
    renderPanel();

    expect(screen.getByText('Simulated assistant — runs in your browser')).toBeInTheDocument();
    expect(screen.getByText('Ask about this layout')).toBeInTheDocument();
    const suggestions = screen.getByRole('group', { name: 'Suggestions' });
    expect(
      within(suggestions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Fix clearance issues', 'Summarise the layout', 'How many drives?']);
    expect(conversation()).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('streams a fix, previews it through the store and applies it as one undo step', async () => {
    renderPanel();
    click('Fix clearance issues');

    expect(conversation()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(useEditor.getState().proposal).toBeNull();

    await finishStreaming();

    expect(conversation()).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(useEditor.getState().proposal?.moves.map((move) => move.tag)).toEqual([
      'VFD-02',
      'CAB-02',
    ]);
    const card = lastCard();
    expect(within(card).getByText('2 moves')).toBeInTheDocument();
    expect(within(card).getByText('X 2.75 m → 3.75 m')).toBeInTheDocument();
    expect(within(card).getByText('2 → 0')).toBeInTheDocument();
    expect(useEditor.getState().items).toEqual(layout);

    fireEvent.click(within(card).getByRole('button', { name: 'Accept' }));

    const state = useEditor.getState();
    expect(state.proposal).toBeNull();
    expect(findViolations(state.items)).toEqual([]);
    expect(state.history.past).toHaveLength(1);
    expect(within(card).getByText('Applied')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
    expect(
      screen.getByText(`Done: 2 items moved in one step. Press ${UNDO_SHORTCUT} to undo it.`),
    ).toBeInTheDocument();
    expect(state.announcement).toBeNull();

    act(() => {
      undo();
    });
    expect(useEditor.getState().items).toEqual(layout);
    expect(useEditor.getState().history.past).toHaveLength(0);
  });

  it('rejecting clears the preview and leaves the layout alone', async () => {
    renderPanel();
    click('Fix clearance issues');
    await finishStreaming();

    const card = lastCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Reject' }));

    expect(useEditor.getState().proposal).toBeNull();
    expect(useEditor.getState().items).toEqual(layout);
    expect(useEditor.getState().history.past).toHaveLength(0);
    expect(within(card).getByText('Rejected')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('blocks a stale proposal and offers to ask again', async () => {
    renderPanel();
    click('Fix clearance issues');
    await finishStreaming();
    const first = useEditor.getState().proposal;
    const move = first?.moves[0];
    if (!first || !move) throw new Error('Expected a proposal');

    act(() => {
      moveItem(move.id, { x: move.from.x, z: move.from.z + 0.5 });
    });

    const card = lastCard();
    expect(within(card).getByText(/layout changed since this proposal/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Accept' })).toBeDisabled();

    fireEvent.click(within(card).getByRole('button', { name: 'Ask again' }));

    expect(useEditor.getState().proposal).toBeNull();
    expect(within(card).getByText('No longer previewed')).toBeInTheDocument();
    await finishStreaming();
    const second = useEditor.getState().proposal;
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first.id);
    expect(proposalCards()).toHaveLength(2);
    expect(within(lastCard()).getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('disables Ask again while another reply is still streaming', async () => {
    renderPanel();
    click('Fix clearance issues');
    await finishStreaming();
    const first = useEditor.getState().proposal;
    const move = first?.moves[0];
    if (!first || !move) throw new Error('Expected a proposal');
    act(() => {
      moveItem(move.id, { x: move.from.x, z: move.from.z + 0.5 });
    });
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);

    const askAgain = within(lastCard()).getByRole('button', { name: 'Ask again' });
    expect(askAgain).toBeDisabled();
    fireEvent.click(askAgain);

    expect(lastCard()).not.toHaveFocus();
    expect(useEditor.getState().proposal).toBe(first);
    await finishStreaming();
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
    expect(proposalCards()).toHaveLength(1);
    expect(within(lastCard()).getByRole('button', { name: 'Ask again' })).toBeEnabled();
  });

  it('stops a reply mid-stream', async () => {
    renderPanel();
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS * 2);

    click('Stop');
    await advance(0);

    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(conversation()).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(messageBox()).toHaveFocus();
    const partial = conversation().textContent;
    await finishStreaming();
    expect(conversation().textContent).toBe(partial);
  });

  it('sends with Enter, keeps Shift+Enter for new lines and ignores IME composition', async () => {
    renderPanel();
    const input = messageBox();

    fireEvent.change(input, { target: { value: 'How many\ndrives?' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
    expect(input).toHaveValue('How many\ndrives?');
    expect(screen.getByText('Ask about this layout')).toBeInTheDocument();

    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);

    expect(input).toHaveValue('');
    expect(within(conversation()).getByText('How many drives?')).toBeInTheDocument();
    await finishStreaming();
    expect(screen.getByText('The layout has 2 drives.')).toBeInTheDocument();
  });

  it('sends the typed message with the Send button', async () => {
    renderPanel();
    fireEvent.change(messageBox(), { target: { value: '  summary  ' } });

    click('Send');
    await finishStreaming();

    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(
      screen.getByText(/^The layout has 4 items: 2 cabinets and 2 drives\./),
    ).toBeInTheDocument();
  });

  it('lets a streaming reply finish: suggestions and Send stay disabled until it ends', async () => {
    renderPanel();
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);

    const chips = within(screen.getByRole('group', { name: 'Suggestions' })).getAllByRole('button');
    for (const chip of chips) expect(chip).toBeDisabled();
    fireEvent.change(messageBox(), { target: { value: 'How many drives?' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();

    click('How many drives?');
    expect(fireEvent.keyDown(messageBox(), { key: 'Enter' })).toBe(false);
    expect(messageBox()).toHaveValue('How many drives?');
    await finishStreaming();

    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
    expect(
      screen.getByText(/^The layout has 4 items: 2 cabinets and 2 drives\./),
    ).toBeInTheDocument();
    expect(within(conversation()).queryByText('How many drives?')).not.toBeInTheDocument();
    for (const chip of chips) expect(chip).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('puts Stop in the slot Send keeps while a reply streams, so the hint never makes room for it', async () => {
    renderPanel();
    const send = screen.getByRole('button', { name: 'Send' });
    const slot = send.parentElement;

    click('Summarise the layout');

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop.parentElement).toBe(slot);
    expect(slot).not.toContainElement(
      screen.getByText('Enter to send · Shift+Enter for a new line'),
    );
    expect(send).toBeDisabled();
    await finishStreaming();
    expect(stop).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBe(send);
  });

  it('ignores the second click of a double-click, which lands on the button that took the slot', async () => {
    renderPanel();
    fireEvent.change(messageBox(), { target: { value: 'Summarise the layout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }), { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }), { detail: 2 });
    await finishStreaming();

    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
    expect(screen.getByText(/I will propose moves\.$/)).toBeInTheDocument();

    fireEvent.change(messageBox(), { target: { value: 'How many drives?' } });
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }), { detail: 1 });
    await advance(0);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeEnabled();
    fireEvent.click(send, { detail: 2 });

    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(messageBox()).toHaveValue('How many drives?');
    expect(within(conversation()).queryByText('How many drives?')).not.toBeInTheDocument();
  });

  it('puts focus back in the message box when the ignored second click of a double-click lands on Send or Stop', async () => {
    renderPanel();
    fireEvent.change(messageBox(), { target: { value: 'How many drives?' } });
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }), { detail: 1 });
    await advance(0);
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();

    fireEvent.click(send, { detail: 2 });

    expect(messageBox()).toHaveFocus();
    expect(messageBox()).toHaveValue('How many drives?');

    fireEvent.click(send, { detail: 1 });
    const stop = screen.getByRole('button', { name: 'Stop' });
    stop.focus();

    fireEvent.click(stop, { detail: 2 });

    expect(messageBox()).toHaveFocus();
    expect(conversation()).toHaveAttribute('aria-busy', 'true');
    await finishStreaming();
  });

  it('cancels presses on disabled composer buttons, so focus stays where it was', async () => {
    renderPanel();
    const chip = screen.getByRole('button', { name: 'How many drives?' });
    expect(fireEvent.pointerDown(chip)).toBe(true);

    click('Summarise the layout');

    expect(chip).toBeDisabled();
    expect(fireEvent.pointerDown(chip)).toBe(false);
    expect(fireEvent.pointerDown(messageBox())).toBe(true);
    await finishStreaming();
    expect(fireEvent.pointerDown(chip)).toBe(true);
  });

  it('adds the proposal card once the reply has finished, so streamed text never pushes it down', async () => {
    renderPanel();
    click('Fix clearance issues');
    for (let chunk = 0; chunk < 50 && useEditor.getState().proposal === null; chunk += 1) {
      await advance(CHUNK_DELAY_MS);
    }

    expect(useEditor.getState().proposal).not.toBeNull();
    expect(conversation()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('group', { name: 'Proposed change' })).not.toBeInTheDocument();

    await finishStreaming();
    expect(within(lastCard()).getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('moves focus to the card and the message box without scrolling the page', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderPanel();
    click('Fix clearance issues');
    await finishStreaming();

    const card = lastCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Reject' }));
    expect(card).toHaveFocus();
    expect(focus.mock.contexts.at(-1)).toBe(card);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);
    click('Stop');
    expect(messageBox()).toHaveFocus();
    expect(focus.mock.contexts.at(-1)).toBe(messageBox());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('moves focus to the message box when the chip, Send or Stop it was on becomes unavailable', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderPanel();
    const chip = screen.getByRole('button', { name: 'Summarise the layout' });
    chip.focus();

    fireEvent.click(chip);

    expect(chip).toBeDisabled();
    expect(messageBox()).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    screen.getByRole('button', { name: 'Stop' }).focus();
    await finishStreaming();

    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(messageBox()).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    fireEvent.change(messageBox(), { target: { value: 'How many drives?' } });
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();

    fireEvent.click(send);

    expect(send).toBeDisabled();
    expect(messageBox()).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    await finishStreaming();
  });

  it('leaves arrow keys to the conversation instead of moving the selected item', async () => {
    renderPanel(<PanelWithShortcuts />);
    click('Fix clearance issues');
    await finishStreaming();
    act(() => {
      select(cabinet.id);
    });
    const reject = within(lastCard()).getByRole('button', { name: 'Reject' });

    for (const target of [conversation(), reject]) {
      expect(fireEvent.keyDown(target, { key: 'ArrowDown' })).toBe(true);
      expect(fireEvent.keyDown(target, { key: 'ArrowLeft', shiftKey: true })).toBe(true);
    }
    expect(useEditor.getState().items).toEqual(layout);
    expect(useEditor.getState().history.past).toHaveLength(0);

    expect(fireEvent.keyDown(document.body, { key: 'ArrowDown' })).toBe(false);
    expect(useEditor.getState().items).not.toEqual(layout);
  });

  it('follows new messages by scrolling the log itself', async () => {
    renderPanel();
    const log = conversation();
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 900 });

    click('Summarise the layout');
    await finishStreaming();

    expect(log.scrollTop).toBe(900);
    expect('scrollIntoView' in Element.prototype).toBe(false);
  });

  it('aborts the stream and clears the preview when unmounted', async () => {
    const signals: AbortSignal[] = [];
    const recording: AssistantTransport = (prompt, context, signal) => {
      signals.push(signal);
      return streamAssistantReply(prompt, context, signal);
    };
    const { unmount } = renderPanel(<AssistantPanel transport={recording} />);
    click('Fix clearance issues');
    await finishStreaming();
    expect(useEditor.getState().proposal).not.toBeNull();
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);
    expect(assistantRequests()).toEqual(['success', 'pending']);

    unmount();

    expect(useEditor.getState().proposal).toBeNull();
    expect(signals.map((signal) => signal.aborted)).toEqual([false, true]);
    await advance(0);
    expect(assistantRequests()).toEqual(['success', 'error']);
  });

  it('shows an error when the transport fails and does not retry the request', async () => {
    let calls = 0;
    const failing: AssistantTransport = async function* () {
      calls += 1;
      await Promise.resolve();
      yield { type: 'text', delta: 'Partial answer' };
      throw new Error('Network down');
    };
    renderPanel(<AssistantPanel transport={failing} />);

    click('Summarise the layout');
    await finishStreaming();

    expect(screen.getByText('Partial answer')).toBeInTheDocument();
    expect(screen.getByText('The assistant could not reply. Try again.')).toBeInTheDocument();
    expect(conversation()).toHaveAttribute('aria-busy', 'false');
    expect(calls).toBe(1);
    expect(assistantRequests()).toEqual(['error']);
    expect(screen.getByRole('button', { name: 'Summarise the layout' })).toBeEnabled();
  });

  it('runs every reply as an assistant request in the query client', async () => {
    renderPanel();

    click('How many drives?');
    expect(assistantRequests()).toEqual(['pending']);
    await finishStreaming();
    click('Summarise the layout');
    await advance(CHUNK_DELAY_MS);
    click('Stop');
    await advance(0);

    expect(assistantRequests()).toEqual(['success', 'error']);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByText('The assistant could not reply. Try again.')).not.toBeInTheDocument();
  });

  it('still replies while the browser is offline, because the simulated assistant runs locally', async () => {
    onlineManager.setOnline(false);
    renderPanel();

    click('How many drives?');
    await finishStreaming();

    expect(screen.getByText('The layout has 2 drives.')).toBeInTheDocument();
    expect(conversation()).toHaveAttribute('aria-busy', 'false');
  });

  it('passes the prompt and the current layout to the transport', async () => {
    const calls: { prompt: string; items: readonly PlacedItem[] }[] = [];
    const recording: AssistantTransport = async function* (prompt, context) {
      await Promise.resolve();
      calls.push({ prompt, items: context.items });
      yield { type: 'done' };
    };
    renderPanel(<AssistantPanel transport={recording} />);

    click('How many drives?');
    await finishStreaming();

    expect(calls).toEqual([{ prompt: 'How many drives?', items: layout }]);
  });

  it('is fully localised in Vietnamese', async () => {
    act(() => {
      setLocale('vi');
    });
    renderPanel();

    expect(
      screen.getByText('Trợ lý mô phỏng — chạy ngay trong trình duyệt của bạn'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Tin nhắn gửi trợ lý' })).toBeInTheDocument();

    click('Có bao nhiêu biến tần?');
    await finishStreaming();
    expect(screen.getByText('Bố trí có 2 biến tần.')).toBeInTheDocument();

    click('Khắc phục lỗi khoảng cách');
    await finishStreaming();
    const card = screen.getByRole('group', { name: 'Thay đổi đề xuất' });
    expect(within(card).getByText('X 2,75 m → 3,75 m')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Chấp nhận' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'Từ chối' })).toBeEnabled();
  });
});
