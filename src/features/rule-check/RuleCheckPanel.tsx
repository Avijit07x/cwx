import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { MIN_CLEARANCE, type Violation } from '../../domain/rules';
import type { ItemId } from '../../domain/types';
import { describeViolation, type TagLookup } from '../../i18n/describe';
import type { Translator } from '../../i18n/translate';
import { useT } from '../../i18n/useT';
import { focusItem, select } from '../../state/actions';
import { useTagOf, useViolations } from '../../state/selectors';
import { useEditor } from '../../state/store';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { CheckCircleIcon, FocusIcon, WarningIcon } from '../../ui/icons';
import { keepIndexRendered } from '../../ui/keepIndexRendered';
import { Section } from '../../ui/Section';
import { Tooltip } from '../../ui/Tooltip';
import styles from './RuleCheckPanel.module.css';

const ROW_HEIGHT_ESTIMATE = 84;
const OVERSCAN = 4;

function estimateRowHeight(): number {
  return ROW_HEIGHT_ESTIMATE;
}

function measureRowHeight(row: Element): number {
  return row.getBoundingClientRect().height;
}

function violationKey({ a, b }: Violation): string {
  return `${a}:${b}`;
}

function showItem(id: ItemId): void {
  select(id, { announce: true });
  focusItem(id);
}

interface ViolationRowProps extends Violation {
  readonly index: number;
  readonly setSize: number;
  readonly top: number;
  readonly active: boolean;
  readonly t: Translator;
  readonly tagOf: TagLookup;
  readonly measure: (element: HTMLLIElement | null) => void;
  readonly onFocusChange: (key: string | null) => void;
}

const ViolationRow = memo(function ViolationRow({
  index,
  setSize,
  top,
  active,
  t,
  tagOf,
  measure,
  onFocusChange,
  ...violation
}: ViolationRowProps) {
  return (
    <li
      ref={measure}
      data-index={index}
      aria-setsize={setSize}
      aria-posinset={index + 1}
      className={styles.item}
      data-active={active || undefined}
      style={{ top }}
      onFocus={() => {
        onFocusChange(violationKey(violation));
      }}
      onBlur={() => {
        onFocusChange(null);
      }}
    >
      <WarningIcon size={14} className={styles.icon} />
      <div>
        <p className={styles.message}>{describeViolation(t, violation, tagOf)}</p>
        <div className={styles.actions}>
          {[violation.a, violation.b].map((id) => {
            const tag = tagOf(id);
            return (
              <Tooltip key={id} content={t.t('rules.showItem', { tag })}>
                <Button
                  size="sm"
                  icon={<FocusIcon size={14} />}
                  className="mono"
                  onClick={() => {
                    showItem(id);
                  }}
                >
                  {tag}
                </Button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </li>
  );
});

export function RuleCheckPanel() {
  const t = useT();
  const violations = useViolations();
  const tagOf = useTagOf();
  const selectedId = useEditor((state) => state.selectedId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const count = violations.length;
  const min = t.metres(MIN_CLEARANCE);

  const focusedIndex =
    focusedKey === null
      ? -1
      : violations.findIndex((violation) => violationKey(violation) === focusedKey);
  const getItemKey = useCallback(
    (row: number) => {
      const violation = violations[row];
      return violation ? violationKey(violation) : row;
    },
    [violations],
  );
  const rangeExtractor = useMemo(() => keepIndexRendered(focusedIndex), [focusedIndex]);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowHeight,
    measureElement: measureRowHeight,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN,
  });

  return (
    <Section
      title={t.t('rules.title')}
      className={styles.section}
      bodyClassName={styles.body}
      meta={
        count > 0 ? (
          <span className={styles.countIssues}>
            <WarningIcon size={12} />
            {t.plural('rules.count', count)}
          </span>
        ) : (
          <span className={styles.countClear}>
            <CheckCircleIcon size={12} />
            {t.t('rules.noIssues')}
          </span>
        )
      }
    >
      <p className={styles.rule}>{t.t('rules.rule', { min })}</p>
      {count === 0 ? (
        <EmptyState
          tone="success"
          icon={<CheckCircleIcon size={20} />}
          title={t.t('rules.emptyTitle')}
        >
          {t.t('rules.emptyBody', { min })}
        </EmptyState>
      ) : (
        <div ref={scrollRef} className={styles.list}>
          <ul
            aria-label={t.t('rules.listLabel')}
            className={styles.rows}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const violation = violations[row.index];
              return (
                violation && (
                  <ViolationRow
                    key={row.key}
                    {...violation}
                    index={row.index}
                    setSize={count}
                    top={row.start}
                    active={violation.a === selectedId || violation.b === selectedId}
                    t={t}
                    tagOf={tagOf}
                    measure={virtualizer.measureElement}
                    onFocusChange={setFocusedKey}
                  />
                )
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}
