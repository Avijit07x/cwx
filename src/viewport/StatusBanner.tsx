import { useMemo } from 'react';
import { rectAt } from '../domain/grid';
import { itemsTooCloseTo, MIN_CLEARANCE, violationsInvolving } from '../domain/rules';
import type { ItemId, ItemKind, Point, Rotation } from '../domain/types';
import { describeViolation } from '../i18n/describe';
import { useT } from '../i18n/useT';
import { selectViolations, useTagOf } from '../state/selectors';
import { useEditor } from '../state/store';
import { cx } from '../ui/cx';
import { CheckCircleIcon, KindIcon, WarningIcon } from '../ui/icons';
import { Kbd } from '../ui/Kbd';
import styles from './Viewport.module.css';

const LISTED_ISSUES = 2;

interface PlacementProps {
  readonly kind: ItemKind;
  readonly rotation: Rotation;
}

function PlacementClearance({ kind, rotation, at }: PlacementProps & { readonly at: Point }) {
  const t = useT();
  const items = useEditor((state) => state.items);
  const conflicts = useMemo(
    () => itemsTooCloseTo(rectAt(kind, rotation, at.x, at.z), items),
    [kind, rotation, at, items],
  );

  if (conflicts.length === 0) {
    return (
      <span className={cx(styles.hint, styles.okText)}>
        <CheckCircleIcon size={14} className={styles.bannerIcon} />
        {t.t('viewport.drag.clear', { min: t.metres(MIN_CLEARANCE) })}
      </span>
    );
  }
  return (
    <span className={cx(styles.hint, styles.dangerText)}>
      <WarningIcon size={14} className={styles.bannerIcon} />
      {t.t('rule.tooCloseTo', { others: t.list(conflicts.map((item) => item.tag)) })}
    </span>
  );
}

function PlacementHint({
  kind,
  rotation,
  sticky,
  singleKeys,
}: PlacementProps & { readonly sticky: boolean; readonly singleKeys: boolean }) {
  const t = useT();
  const ghost = useEditor((state) => state.ghost);
  return (
    <div className={cx(styles.panel, styles.banner)}>
      <span className={styles.bannerTitle}>
        <KindIcon kind={kind} size={14} />
        {t.t('viewport.placing', { kind: t.kindName(kind) })}
      </span>
      {ghost && <PlacementClearance kind={kind} rotation={rotation} at={ghost} />}
      <span className={styles.hint}>
        <Kbd>{t.t('viewport.key.enter')}</Kbd>
        {t.t('viewport.hint.place')}
      </span>
      {sticky ? (
        <span className={cx(styles.sticky, styles.secondaryHint)}>
          {t.t('viewport.hint.sticky')}
        </span>
      ) : (
        <span className={cx(styles.hint, styles.secondaryHint)}>
          <Kbd>{t.t('viewport.key.shift')}</Kbd>
          {t.t('viewport.hint.keepPlacing')}
        </span>
      )}
      {singleKeys && (
        <span className={cx(styles.hint, styles.secondaryHint)}>
          <Kbd>{t.t('viewport.key.rotate')}</Kbd>
          {t.t('viewport.hint.rotate')}
        </span>
      )}
      <span className={cx(styles.hint, styles.secondaryHint)}>
        <Kbd>{t.t('viewport.key.escape')}</Kbd>
        {t.t('viewport.hint.cancel')}
      </span>
    </div>
  );
}

function DragStatus({ id }: { readonly id: ItemId }) {
  const t = useT();
  const violations = useEditor(selectViolations);
  const tagOf = useTagOf();
  const own = useMemo(() => violationsInvolving(id, violations), [id, violations]);

  if (own.length === 0) {
    return (
      <div className={cx(styles.panel, styles.banner, styles.ok)}>
        <CheckCircleIcon size={14} className={styles.bannerIcon} />
        {t.t('viewport.drag.clear', { min: t.metres(MIN_CLEARANCE) })}
      </div>
    );
  }

  return (
    <div className={cx(styles.panel, styles.banner, styles.danger)}>
      <WarningIcon size={14} className={styles.bannerIcon} />
      <ul className={styles.issues}>
        {own.slice(0, LISTED_ISSUES).map((violation) => (
          <li key={`${violation.a}:${violation.b}`}>{describeViolation(t, violation, tagOf)}</li>
        ))}
        {own.length > LISTED_ISSUES && (
          <li>{t.plural('viewport.drag.more', own.length - LISTED_ISSUES)}</li>
        )}
      </ul>
    </div>
  );
}

export function StatusBanner({ singleKeys }: { readonly singleKeys: boolean }) {
  const tool = useEditor((state) => state.tool);
  const dragId = useEditor((state) => state.drag?.id ?? null);
  if (tool.type === 'place') {
    return (
      <PlacementHint
        kind={tool.kind}
        rotation={tool.rotation}
        sticky={tool.sticky}
        singleKeys={singleKeys}
      />
    );
  }
  return dragId ? <DragStatus id={dragId} /> : null;
}
