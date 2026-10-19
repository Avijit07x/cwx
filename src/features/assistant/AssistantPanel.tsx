import { useMutation } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { Proposal } from '../../domain/proposal';
import type { MessageKey } from '../../i18n/messages';
import { useT } from '../../i18n/useT';
import { UNDO_SHORTCUT } from '../../platform';
import { acceptProposal, rejectProposal, showProposal } from '../../state/actions';
import { ASSISTANT_REPLY_KEY } from '../../state/queryClient';
import { useEditor } from '../../state/store';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { SendIcon, SparkleIcon, StopIcon, WarningIcon } from '../../ui/icons';
import { Section } from '../../ui/Section';
import styles from './AssistantPanel.module.css';
import { streamAssistantReply, type AssistantContext, type AssistantTransport } from './mockAgent';
import { ProposalCard, type ProposalOutcome } from './ProposalCard';

type ReplyStatus = 'streaming' | 'done' | 'stopped' | 'failed';

interface UserTurn {
  readonly role: 'user';
  readonly id: number;
  readonly text: string;
}

interface AssistantTurn {
  readonly role: 'assistant';
  readonly id: number;
  readonly prompt: string | null;
  readonly text: string;
  readonly status: ReplyStatus;
  readonly proposal: Proposal | null;
  readonly outcome: ProposalOutcome | null;
}

type Turn = UserTurn | AssistantTurn;

interface ReplyRequest {
  readonly replyId: number;
  readonly prompt: string;
  readonly context: AssistantContext;
  readonly signal: AbortSignal;
}

const SUGGESTIONS = [
  'assistant.suggest.fix',
  'assistant.suggest.summary',
  'assistant.suggest.count',
] as const satisfies readonly MessageKey[];

let turnSeq = 0;

function nextTurnId(): number {
  turnSeq += 1;
  return turnSeq;
}

function assistantTurn(prompt: string | null, text: string, status: ReplyStatus): AssistantTurn {
  return {
    role: 'assistant',
    id: nextTurnId(),
    prompt,
    text,
    status,
    proposal: null,
    outcome: null,
  };
}

function ignorePressOnDisabledButton(event: PointerEvent): void {
  if (event.target instanceof Element && event.target.closest('button:disabled')) {
    event.preventDefault();
  }
}

interface ComposerProps {
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly streaming: boolean;
  readonly onAsk: (prompt: string) => void;
  readonly onStop: () => void;
}

function Composer({ inputRef, streaming, onAsk, onStop }: ComposerProps) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const hintId = useId();
  const canSend = !streaming && draft.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    setDraft('');
    onAsk(draft);
  };

  const focusInput = () => {
    inputRef.current?.focus({ preventScroll: true });
  };

  const ignoreRepeatClick = (event: MouseEvent): boolean => {
    if (event.detail <= 1) return false;
    event.preventDefault();
    focusInput();
    return true;
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      className={styles.composer}
      onPointerDown={ignorePressOnDisabledButton}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div role="group" aria-label={t.t('assistant.suggestions')} className={styles.chips}>
        {SUGGESTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className={styles.chip}
            disabled={streaming}
            onClick={() => {
              onAsk(t.t(key));
            }}
          >
            {t.t(key)}
          </button>
        ))}
      </div>
      <label htmlFor={inputId} className="sr-only">
        {t.t('assistant.inputLabel')}
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        className={styles.input}
        rows={2}
        value={draft}
        placeholder={t.t('assistant.placeholder')}
        aria-describedby={hintId}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={onInputKeyDown}
      />
      <div className={styles.footer}>
        <p id={hintId} className={styles.hint}>
          {t.t('assistant.inputHint')}
        </p>
        <div className={styles.actionSlot}>
          <Button
            type="submit"
            size="sm"
            variant="ai"
            icon={<SendIcon size={14} />}
            disabled={!canSend}
            className={cx(streaming && styles.replacedByStop)}
            onClick={ignoreRepeatClick}
          >
            <span className={styles.slotLabels}>
              <span>{t.t('assistant.send')}</span>
              <span aria-hidden="true">{t.t('assistant.stop')}</span>
            </span>
          </Button>
          {streaming && (
            <Button
              size="sm"
              icon={<StopIcon size={14} />}
              onClick={(event) => {
                if (ignoreRepeatClick(event)) return;
                onStop();
                focusInput();
              }}
            >
              {t.t('assistant.stop')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

interface AssistantPanelProps {
  readonly transport?: AssistantTransport;
}

export function AssistantPanel({ transport = streamAssistantReply }: AssistantPanelProps) {
  const t = useT();
  const activeProposalId = useEditor((state) => state.proposal?.id ?? null);
  const inspectorTab = useEditor((state) => state.inspectorTab);
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      rejectProposal();
    },
    [],
  );

  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, inspectorTab]);

  const updateReply = (id: number, change: (turn: AssistantTurn) => AssistantTurn) => {
    setTurns((current) =>
      current.map((turn) => (turn.role === 'assistant' && turn.id === id ? change(turn) : turn)),
    );
  };

  const keepFocusInComposer = () => {
    const input = inputRef.current;
    if (input?.form?.contains(document.activeElement)) input.focus({ preventScroll: true });
  };

  const reply = useMutation({
    mutationKey: ASSISTANT_REPLY_KEY,
    mutationFn: async ({ replyId, prompt, context, signal }: ReplyRequest) => {
      for await (const event of transport(prompt, context, signal)) {
        if (event.type === 'done') return;
        if (event.type === 'text') {
          updateReply(replyId, (turn) => ({ ...turn, text: turn.text + event.delta }));
        } else {
          showProposal(event.proposal);
          updateReply(replyId, (turn) => ({ ...turn, proposal: event.proposal }));
        }
      }
    },
  });
  const streaming = reply.isPending;

  const ask = (input: string) => {
    const prompt = input.trim();
    if (prompt.length === 0) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const question: UserTurn = { role: 'user', id: nextTurnId(), text: prompt };
    const answer = assistantTurn(prompt, '', 'streaming');
    setTurns((current) => [...current, question, answer]);
    keepFocusInComposer();
    const settle = (status: ReplyStatus) => {
      updateReply(answer.id, (turn) => ({ ...turn, status }));
      keepFocusInComposer();
    };
    const { locale, items } = useEditor.getState();
    reply.mutate(
      {
        replyId: answer.id,
        prompt,
        context: { locale, items },
        signal: controller.signal,
      },
      {
        onSuccess: () => {
          settle('done');
        },
        onError: () => {
          settle(controller.signal.aborted ? 'stopped' : 'failed');
        },
      },
    );
  };

  const accept = (turn: AssistantTurn, proposal: Proposal) => {
    if (acceptProposal({ announce: false }) !== 'applied') return;
    const confirmation = assistantTurn(
      null,
      t.plural('assistant.reply.applied', proposal.moves.length, { undoKey: UNDO_SHORTCUT }),
      'done',
    );
    updateReply(turn.id, (current) => ({ ...current, outcome: 'accepted' }));
    setTurns((current) => [...current, confirmation]);
  };

  const reject = (turn: AssistantTurn) => {
    rejectProposal();
    updateReply(turn.id, (current) => ({ ...current, outcome: 'rejected' }));
  };

  const askAgain = (turn: AssistantTurn) => {
    if (turn.prompt === null) return;
    rejectProposal();
    ask(turn.prompt);
  };

  const renderTurn = (turn: Turn) => {
    if (turn.role === 'user') {
      return (
        <div key={turn.id} className={styles.question}>
          <p className={styles.text}>
            <span className="sr-only">{`${t.t('assistant.you')} `}</span>
            {turn.text}
          </p>
        </div>
      );
    }
    const { proposal } = turn;
    return (
      <div key={turn.id} className={styles.reply}>
        <span className={styles.avatar}>
          <SparkleIcon size={14} />
        </span>
        <div className={styles.replyBody}>
          <p className={styles.text}>
            <span className="sr-only">{`${t.t('assistant.assistant')} `}</span>
            {turn.text}
            {turn.status === 'streaming' && <span className={styles.caret} aria-hidden="true" />}
          </p>
          {turn.status === 'stopped' && (
            <p className={styles.stopped}>{t.t('assistant.stopped')}</p>
          )}
          {turn.status === 'failed' && (
            <p className={styles.failed}>
              <WarningIcon size={14} />
              {t.t('assistant.failed')}
            </p>
          )}
          {proposal && turn.status !== 'streaming' && (
            <ProposalCard
              proposal={proposal}
              active={proposal.id === activeProposalId}
              outcome={turn.outcome}
              busy={streaming}
              onAccept={() => {
                accept(turn, proposal);
              }}
              onReject={() => {
                reject(turn);
              }}
              onAskAgain={() => {
                askAgain(turn);
              }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <Section title={t.t('assistant.title')} className={styles.panel} bodyClassName={styles.body}>
      <div className={styles.note}>
        <SparkleIcon size={14} className={styles.noteIcon} />
        <div>
          <p className={styles.noteTitle}>{t.t('assistant.simulated')}</p>
          <p className={styles.noteDetail}>{t.t('assistant.simulatedDetail')}</p>
        </div>
      </div>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={streaming}
        aria-label={t.t('assistant.log')}
        tabIndex={0}
        className={styles.log}
      >
        {turns.length === 0 ? (
          <EmptyState
            className={styles.welcome}
            icon={<SparkleIcon size={20} />}
            title={t.t('assistant.welcomeTitle')}
          >
            {t.t('assistant.welcomeBody')}
          </EmptyState>
        ) : (
          turns.map(renderTurn)
        )}
      </div>
      <Composer
        inputRef={inputRef}
        streaming={streaming}
        onAsk={ask}
        onStop={() => {
          controllerRef.current?.abort();
        }}
      />
    </Section>
  );
}
