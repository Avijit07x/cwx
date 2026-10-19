import { useVirtualizer } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ITEM_KINDS, type ItemId, type PlacedItem } from '../../domain/types';
import { foldText } from '../../i18n/format';
import type { Translator } from '../../i18n/translate';
import { useT } from '../../i18n/useT';
import { announce, focusSelection, hover, removeItem, select } from '../../state/actions';
import { selectEffectiveItems, useViolatingIds } from '../../state/selectors';
import { useEditor } from '../../state/store';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { TextInput } from '../../ui/Field';
import { KindIcon, ListIcon, SearchIcon, WarningIcon } from '../../ui/icons';
import { keepIndexRendered } from '../../ui/keepIndexRendered';
import { Section } from '../../ui/Section';
import styles from './ItemList.module.css';

const MATCHES_ANNOUNCE_DELAY_MS = 500;
const ROW_HEIGHT = 44;
const OVERSCAN = 6;
const FILTER_MAX_LENGTH = 64;
const ECHOED_QUERY_LENGTH = 24;

function rowHeight(): number {
  return ROW_HEIGHT;
}

function shorten(text: string, length: number): string {
  const characters = Array.from(new Intl.Segmenter().segment(text), ({ segment }) => segment);
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : text;
}

function filterItems(
  items: readonly PlacedItem[],
  query: string,
  t: Translator,
): readonly PlacedItem[] {
  const needle = foldText(query.trim());
  if (needle === '') return items;
  const kinds = new Set(
    ITEM_KINDS.filter((kind) =>
      [t.kindShort(kind), t.kindName(kind)].some((name) => foldText(name).includes(needle)),
    ),
  );
  return items.filter((item) => kinds.has(item.kind) || foldText(item.tag).includes(needle));
}

type Step = (index: number, last: number) => number;

const NAVIGATION_KEYS: Partial<Record<string, Step>> = {
  ArrowDown: (index, last) => (index === -1 ? 0 : Math.min(index + 1, last)),
  ArrowUp: (index, last) => (index === -1 ? last : Math.max(index - 1, 0)),
  Home: () => 0,
  End: (_index, last) => last,
};

const PLACEMENT_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'Enter']);

function handleListKey(
  key: string,
  visible: readonly PlacedItem[],
  selectedId: ItemId | null,
  beforeEmptied: () => void,
): boolean {
  if (PLACEMENT_KEYS.has(key) && useEditor.getState().tool.type === 'place') return false;
  const index = visible.findIndex((item) => item.id === selectedId);
  const step = NAVIGATION_KEYS[key];
  if (step) {
    const target = visible[step(index, visible.length - 1)];
    if (target) select(target.id);
    return true;
  }
  const current = visible[index];
  if (key === 'Enter') {
    if (current) focusSelection();
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (!current) return true;
    const next = visible[index + 1] ?? visible[index - 1];
    if (!next) beforeEmptied();
    removeItem(current.id, next?.id);
    return true;
  }
  return false;
}

interface ItemRowProps {
  readonly item: PlacedItem;
  readonly optionId: string;
  readonly index: number;
  readonly setSize: number;
  readonly top: number;
  readonly height: number;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly violating: boolean;
  readonly t: Translator;
}

const ItemRow = memo(function ItemRow({
  item,
  optionId,
  index,
  setSize,
  top,
  height,
  selected,
  hovered,
  violating,
  t,
}: ItemRowProps) {
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={selected}
      aria-setsize={setSize}
      aria-posinset={index + 1}
      data-hovered={hovered || undefined}
      className={styles.option}
      style={{ top, height }}
      onClick={() => {
        document.getSelection()?.removeAllRanges();
        select(item.id);
      }}
      onMouseEnter={() => {
        hover(item.id);
      }}
      onMouseLeave={() => {
        hover(null);
      }}
    >
      <span className={styles.icon} style={{ color: `var(--color-kind-${item.kind})` }}>
        <KindIcon kind={item.kind} />
      </span>
      <span className={cx(styles.tag, 'mono')} title={item.tag}>
        {item.tag}
      </span>{' '}
      <span className={styles.kind}>{t.kindShort(item.kind)}</span>{' '}
      <span className={cx(styles.position, 'num')}>
        {t.t('list.position', { x: t.decimal(item.x), z: t.decimal(item.z) })}
      </span>
      {violating && (
        <>
          {' '}
          <span className={styles.issue}>
            <WarningIcon size={12} />
            {t.t('list.tooClose')}
          </span>
        </>
      )}
    </div>
  );
});

export function ItemList() {
  const t = useT();
  const items = useEditor(selectEffectiveItems);
  const selectedId = useEditor((state) => state.selectedId);
  const hoveredId = useEditor((state) => state.hoveredId);
  const violatingIds = useViolatingIds();
  const [query, setQuery] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hintId = `${listId}-hint`;
  const optionId = (id: ItemId) => `${listId}-${id}`;

  const visible = useMemo(() => filterItems(items, query, t), [items, query, t]);
  const trimmedQuery = query.trim();
  const filtering = trimmedQuery !== '';
  const matchCount = visible.length;
  const activeIndex = visible.findIndex((item) => item.id === selectedId);
  const active = visible[activeIndex];

  const getItemKey = useCallback((index: number) => visible[index]?.id ?? index, [visible]);
  const rangeExtractor = useMemo(() => keepIndexRendered(activeIndex), [activeIndex]);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: matchCount,
    getScrollElement: () => listRef.current,
    estimateSize: rowHeight,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN,
  });

  useLayoutEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex);
  }, [virtualizer, activeIndex]);

  useEffect(() => {
    if (!filtering) return;
    const timer = setTimeout(() => {
      announce(t.plural('list.matches', matchCount));
    }, MATCHES_ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [filtering, query, matchCount, t]);

  const focusBody = () => {
    bodyRef.current?.focus({ preventScroll: true });
  };

  const clearFilter = () => {
    setQuery('');
    filterRef.current?.focus({ preventScroll: true });
  };

  const count = filtering
    ? t.t('list.filteredCount', { shown: t.integer(matchCount), total: t.integer(items.length) })
    : t.integer(items.length);

  return (
    <Section
      title={t.t('list.title')}
      meta={count}
      className={styles.section}
      bodyClassName={styles.body}
    >
      <div ref={bodyRef} tabIndex={-1} className={styles.body}>
        {items.length === 0 ? (
          <EmptyState icon={<ListIcon size={20} />} title={t.t('list.empty')}>
            {t.t('list.emptyHint')}
          </EmptyState>
        ) : (
          <>
            <div className={styles.filter}>
              <span className={styles.searchIcon}>
                <SearchIcon size={14} />
              </span>
              <TextInput
                ref={filterRef}
                type="search"
                value={query}
                aria-label={t.t('list.filterLabel')}
                placeholder={t.t('list.filterPlaceholder')}
                maxLength={FILTER_MAX_LENGTH}
                autoComplete="off"
                spellCheck={false}
                className={styles.filterInput}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                }}
              />
            </div>
            {matchCount === 0 ? (
              <EmptyState
                icon={<SearchIcon size={20} />}
                title={
                  <span title={trimmedQuery}>
                    {t.t('list.noMatches', {
                      query: shorten(trimmedQuery, ECHOED_QUERY_LENGTH),
                    })}
                  </span>
                }
              >
                <Button size="sm" onClick={clearFilter}>
                  {t.t('list.clearFilter')}
                </Button>
              </EmptyState>
            ) : (
              <div
                ref={listRef}
                role="listbox"
                tabIndex={0}
                aria-label={t.t('list.title')}
                aria-describedby={hintId}
                aria-activedescendant={active ? optionId(active.id) : undefined}
                className={styles.list}
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey) return;
                  if (!handleListKey(event.key, visible, selectedId, focusBody)) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <div
                  role="presentation"
                  className={styles.rows}
                  style={{ height: virtualizer.getTotalSize() }}
                >
                  {virtualizer.getVirtualItems().map((row) => {
                    const item = visible[row.index];
                    return (
                      item && (
                        <ItemRow
                          key={item.id}
                          item={item}
                          optionId={optionId(item.id)}
                          index={row.index}
                          setSize={matchCount}
                          top={row.start}
                          height={row.size}
                          selected={item.id === selectedId}
                          hovered={item.id === hoveredId}
                          violating={violatingIds.has(item.id)}
                          t={t}
                        />
                      )
                    );
                  })}
                </div>
              </div>
            )}
            <p id={hintId} className="sr-only">
              {t.t('list.instructions')}
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
