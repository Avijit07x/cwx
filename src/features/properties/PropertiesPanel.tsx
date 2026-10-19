import { NumberField } from '@base-ui/react/number-field';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CATALOG } from '../../domain/catalog';
import { FLOOR, footprint } from '../../domain/grid';
import type { EditError } from '../../domain/ops';
import { MIN_CLEARANCE, otherItem, violationsInvolving } from '../../domain/rules';
import { ROTATIONS, type ItemId, type PlacedItem } from '../../domain/types';
import { describeEditError } from '../../i18n/describe';
import { INTL_LOCALE } from '../../i18n/locales';
import { useT } from '../../i18n/useT';
import {
  announce,
  duplicateSelection,
  focusItem,
  moveItem,
  removeItem,
  renameItem,
  select,
  setItemRotation,
} from '../../state/actions';
import { useSelectedItem, useTagOf, useViolations } from '../../state/selectors';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { Field, TextInput } from '../../ui/Field';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CursorIcon,
  DuplicateIcon,
  FocusIcon,
  KindIcon,
  TrashIcon,
  WarningIcon,
} from '../../ui/icons';
import { Section } from '../../ui/Section';
import { Segmented } from '../../ui/Segmented';
import { Tooltip } from '../../ui/Tooltip';
import styles from './PropertiesPanel.module.css';

const CLEARANCE_LIMIT = 5;
const COORDINATE_FORMAT: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
};

function withSlot(text: string, slot: string, node: ReactNode): ReactNode {
  const [before = '', after = ''] = text.split(slot);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

function TagField({ item }: { readonly item: PlacedItem }) {
  const t = useT();
  const tagOf = useTagOf();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<EditError | null>(null);

  const revert = () => {
    setDraft(null);
    setError(null);
  };

  const commit = () => {
    if (draft === null) return;
    const outcome = renameItem(item.id, draft);
    if (outcome.status === 'rejected') {
      setError(outcome.error);
      announce(describeEditError(t, outcome.error, tagOf));
      return;
    }
    revert();
  };

  return (
    <Field label={t.t('props.tag')} error={error ? describeEditError(t, error, tagOf) : undefined}>
      {(control) => (
        <TextInput
          {...control}
          value={draft ?? item.tag}
          autoComplete="off"
          spellCheck={false}
          className={styles.tagInput}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            else if (event.key === 'Escape') revert();
          }}
        />
      )}
    </Field>
  );
}

interface CoordinateFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number) => void;
}

function CoordinateField({ label, value, min, max, onCommit }: CoordinateFieldProps) {
  const t = useT();
  const [draft, setDraft] = useState<number | null>(null);
  const [session, setSession] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocusRef = useRef(false);

  useLayoutEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [session]);

  const commit = (next: number | null) => {
    setDraft(null);
    if (next !== null && next !== value) onCommit(next);
  };

  const restart = () => {
    refocusRef.current = true;
    setSession((current) => current + 1);
  };

  return (
    <Field label={label}>
      {(control) => (
        <NumberField.Root
          key={session}
          id={control.id}
          value={draft ?? value}
          min={min}
          max={max}
          step={FLOOR.cell}
          smallStep={FLOOR.cell}
          largeStep={FLOOR.cell * 2}
          locale={INTL_LOCALE[t.locale]}
          format={COORDINATE_FORMAT}
          onValueChange={setDraft}
          onValueCommitted={commit}
        >
          <NumberField.Group className={styles.stepper}>
            <NumberField.Input
              ref={inputRef}
              aria-roledescription={t.t('props.numberField')}
              className={styles.numberInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit(draft);
                else if (event.key === 'Escape') setDraft(null);
                else return;
                restart();
              }}
            />
            <span className={styles.unit} aria-hidden="true">
              {t.t('props.unit')}
            </span>
            <NumberField.Decrement
              aria-label={t.t('props.decrease', { axis: label })}
              className={styles.step}
            >
              <ChevronDownIcon size={14} />
            </NumberField.Decrement>
            <NumberField.Increment
              aria-label={t.t('props.increase', { axis: label })}
              className={styles.step}
            >
              <ChevronUpIcon size={14} />
            </NumberField.Increment>
          </NumberField.Group>
        </NumberField.Root>
      )}
    </Field>
  );
}

function EditableFields({ item }: { readonly item: PlacedItem }) {
  const t = useT();
  const positionId = useId();
  const { w, d } = footprint(item.kind, item.rotation);
  return (
    <>
      <TagField item={item} />
      <div role="group" aria-labelledby={positionId} className={styles.group}>
        <span id={positionId} className={styles.label}>
          {t.t('props.position')}
        </span>
        <div className={styles.coordinates}>
          <CoordinateField
            label={t.t('props.x')}
            value={item.x}
            min={w / 2}
            max={FLOOR.width - w / 2}
            onCommit={(x) => {
              moveItem(item.id, { x, z: item.z });
            }}
          />
          <CoordinateField
            label={t.t('props.z')}
            value={item.z}
            min={d / 2}
            max={FLOOR.depth - d / 2}
            onCommit={(z) => {
              moveItem(item.id, { x: item.x, z });
            }}
          />
        </div>
      </div>
    </>
  );
}

interface ClearanceProps {
  readonly item: PlacedItem;
  readonly onShowItem: (id: ItemId) => void;
}

function Clearance({ item, onShowItem }: ClearanceProps) {
  const t = useT();
  const violations = useViolations();
  const tagOf = useTagOf();
  const mine = violationsInvolving(item.id, violations).toSorted((p, q) => p.gap - q.gap);
  const hiddenCount = mine.length - CLEARANCE_LIMIT;
  return (
    <div className={styles.group}>
      <h4 className={styles.label}>{t.t('props.clearance')}</h4>
      {mine.length === 0 ? (
        <p className={styles.ok}>
          <CheckCircleIcon size={14} />
          {t.t('props.clearanceOk', { min: t.metres(MIN_CLEARANCE) })}
        </p>
      ) : (
        <ul className={styles.issues}>
          {mine.slice(0, CLEARANCE_LIMIT).map((violation) => {
            const otherId = otherItem(violation, item.id);
            const tag = tagOf(otherId);
            const text = violation.overlap
              ? t.t('props.overlaps', { tag: '{tag}' })
              : t.t('props.gapTo', { gap: t.metres(violation.gap), tag: '{tag}' });
            return (
              <li key={otherId} className={styles.issue}>
                <WarningIcon size={14} />
                <span>
                  {withSlot(
                    text,
                    '{tag}',
                    <button
                      type="button"
                      className={cx(styles.tagButton, 'mono')}
                      onClick={() => {
                        onShowItem(otherId);
                      }}
                    >
                      {tag}
                    </button>,
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {hiddenCount > 0 && <p className={styles.more}>{t.plural('props.more', hiddenCount)}</p>}
    </div>
  );
}

interface ItemPropertiesProps {
  readonly item: PlacedItem;
  readonly onRemoved: () => void;
}

function ItemProperties({ item, onRemoved }: ItemPropertiesProps) {
  const t = useT();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const spec = CATALOG[item.kind];
  const size = footprint(item.kind, item.rotation);
  const rotations = ROTATIONS.map((rotation) => ({ value: rotation, label: t.degrees(rotation) }));

  const showItem = (id: ItemId) => {
    select(id);
    headingRef.current?.focus();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.chip} style={{ color: `var(--color-kind-${item.kind})` }}>
          <KindIcon kind={item.kind} size={18} />
        </span>
        <div className={styles.titles}>
          <h3 ref={headingRef} tabIndex={-1} className={styles.heading}>
            {item.tag}
          </h3>
          <p className={styles.kindName}>{t.kindName(item.kind)}</p>
        </div>
      </div>
      <EditableFields key={item.id} item={item} />
      <div className={styles.group}>
        <span className={styles.label} aria-hidden="true">
          {t.t('props.rotation')}
        </span>
        <Segmented
          legend={t.t('props.rotation')}
          options={rotations}
          value={item.rotation}
          onChange={(rotation) => {
            setItemRotation(item.id, rotation);
          }}
        />
      </div>
      <dl className={styles.details}>
        <dt>{t.t('props.size')}</dt>
        <dd className="num">
          {t.t('props.sizeValue', {
            w: t.metres(size.w),
            d: t.metres(size.d),
            h: t.metres(spec.height),
          })}
        </dd>
        <dt>{t.t('props.partNumber')}</dt>
        <dd className="mono">{spec.partNumber}</dd>
        <dt>{t.t('props.unitPrice')}</dt>
        <dd className="num">{t.usd(spec.unitPriceUsd)}</dd>
      </dl>
      <Clearance item={item} onShowItem={showItem} />
      <div className={styles.actions}>
        <Tooltip content={t.t('props.focusHint')}>
          <Button
            size="sm"
            icon={<FocusIcon size={14} />}
            onClick={() => {
              focusItem(item.id);
            }}
          >
            {t.t('props.focus')}
          </Button>
        </Tooltip>
        <Button
          size="sm"
          icon={<DuplicateIcon size={14} />}
          onClick={() => {
            duplicateSelection();
          }}
        >
          {t.t('props.duplicate')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<TrashIcon size={14} />}
          className={styles.delete}
          onClick={() => {
            removeItem(item.id);
            onRemoved();
          }}
        >
          {t.t('props.delete')}
        </Button>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const t = useT();
  const item = useSelectedItem();
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Section title={t.t('props.title')} className={styles.section}>
      <div ref={bodyRef} tabIndex={-1} className={styles.body}>
        {item ? (
          <ItemProperties
            item={item}
            onRemoved={() => {
              bodyRef.current?.focus();
            }}
          />
        ) : (
          <EmptyState icon={<CursorIcon size={20} />} title={t.t('props.empty')}>
            {t.t('props.emptyHint')}
          </EmptyState>
        )}
      </div>
    </Section>
  );
}
