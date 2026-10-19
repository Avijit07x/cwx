import { useId, useRef } from 'react';
import type { Proposal, ProposedMove } from '../../domain/proposal';
import type { Translator } from '../../i18n/translate';
import { useT } from '../../i18n/useT';
import {
  selectCommittedViolations,
  selectProposalStale,
  selectProposalViolations,
  useTagOf,
} from '../../state/selectors';
import { useEditor } from '../../state/store';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { CheckCircleIcon, SparkleIcon, WarningIcon } from '../../ui/icons';
import styles from './ProposalCard.module.css';

export type ProposalOutcome = 'accepted' | 'rejected';

interface ProposalCardProps {
  readonly proposal: Proposal;
  readonly active: boolean;
  readonly outcome: ProposalOutcome | null;
  readonly busy: boolean;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onAskAgain: () => void;
}

function describeChanges(t: Translator, move: ProposedMove): string[] {
  const { from, to } = move;
  const changes = (['x', 'z'] as const)
    .filter((axis) => from[axis] !== to[axis])
    .map((axis) =>
      t.t('assistant.proposal.axisChange', {
        axis: axis.toUpperCase(),
        from: t.metres(from[axis]),
        to: t.metres(to[axis]),
      }),
    );
  if (from.rotation !== to.rotation) {
    changes.push(
      t.t('assistant.proposal.rotationChange', {
        from: t.degrees(from.rotation),
        to: t.degrees(to.rotation),
      }),
    );
  }
  return changes;
}

export function ProposalCard({
  proposal,
  active,
  outcome,
  busy,
  onAccept,
  onReject,
  onAskAgain,
}: ProposalCardProps) {
  const t = useT();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const stale = useEditor((state) => active && selectProposalStale(state));
  const before = useEditor((state) =>
    active ? selectCommittedViolations(state).length : proposal.violationsBefore,
  );
  const after = useEditor((state) =>
    active
      ? (selectProposalViolations(state)?.length ?? proposal.violationsAfter)
      : proposal.violationsAfter,
  );
  const tagOf = useTagOf();
  const resolved = after === 0;

  const thenFocusCard = (action: () => void) => () => {
    action();
    cardRef.current?.focus({ preventScroll: true });
  };

  const footer = () => {
    if (outcome === 'accepted') {
      return (
        <p className={cx(styles.outcome, styles.applied)}>
          <CheckCircleIcon size={14} />
          {t.t('assistant.proposal.applied')}
        </p>
      );
    }
    if (outcome === 'rejected' || !active) {
      return (
        <p className={styles.outcome}>
          {t.t(
            outcome === 'rejected' ? 'assistant.proposal.rejected' : 'assistant.proposal.closed',
          )}
        </p>
      );
    }
    return (
      <>
        {stale ? (
          <p className={styles.stale}>
            <WarningIcon size={14} className={styles.staleIcon} />
            {t.t('assistant.proposal.stale')}
          </p>
        ) : (
          <p className={styles.preview}>{t.t('assistant.proposal.preview')}</p>
        )}
        <div className={styles.actions}>
          <Button variant="ai" size="sm" disabled={stale} onClick={thenFocusCard(onAccept)}>
            {t.t('assistant.proposal.accept')}
          </Button>
          {stale && (
            <Button size="sm" disabled={busy} onClick={thenFocusCard(onAskAgain)}>
              {t.t('assistant.proposal.askAgain')}
            </Button>
          )}
          <Button size="sm" onClick={thenFocusCard(onReject)}>
            {t.t('assistant.proposal.reject')}
          </Button>
        </div>
      </>
    );
  };

  return (
    <div
      ref={cardRef}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cx(styles.card, !active && styles.inactive)}
    >
      <div className={styles.header}>
        <SparkleIcon size={14} />
        <h3 id={titleId} className={styles.title}>
          {t.t('assistant.proposal.title')}
        </h3>
        <span className={styles.meta}>
          {t.plural('assistant.proposal.moves', proposal.moves.length)}
        </span>
      </div>
      <ul className={styles.moves}>
        {proposal.moves.map((move) => (
          <li key={move.id} className={styles.move}>
            <span className={cx('mono', styles.tag)}>{(active && tagOf(move.id)) || move.tag}</span>
            {describeChanges(t, move).map((change) => (
              <span key={change} className={cx('num', styles.change)}>
                {change}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className={styles.issues}>
        <span>{t.t('assistant.proposal.issues')}</span>
        <span
          className={cx('num', styles.issuesChange, resolved ? styles.resolved : styles.remaining)}
        >
          {resolved ? <CheckCircleIcon size={14} /> : <WarningIcon size={14} />}
          {t.t('assistant.proposal.issuesChange', {
            before: t.integer(before),
            after: t.integer(after),
          })}
        </span>
      </p>
      {footer()}
    </div>
  );
}
