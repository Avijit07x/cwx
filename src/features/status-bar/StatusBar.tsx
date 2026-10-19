import { FLOOR } from '../../domain/grid';
import type { Translator } from '../../i18n/translate';
import { useT } from '../../i18n/useT';
import { selectViolations } from '../../state/selectors';
import { useEditor, type SaveStatus } from '../../state/store';
import { cx } from '../../ui/cx';
import {
  CheckCircleIcon,
  CloudIcon,
  CursorIcon,
  GridIcon,
  ListIcon,
  WarningIcon,
} from '../../ui/icons';
import { useCursorPoint } from '../../viewport/cursorStore';
import styles from './StatusBar.module.css';

function ItemCount() {
  const t = useT();
  const count = useEditor((state) => state.items.length);
  return (
    <li className={styles.item}>
      <ListIcon size={14} />
      {t.plural('status.items', count)}
    </li>
  );
}

function ClearanceIssues() {
  const t = useT();
  const count = useEditor((state) => selectViolations(state).length);
  return count > 0 ? (
    <li className={styles.item} data-tone="danger">
      <WarningIcon size={14} />
      {t.plural('status.issues', count)}
    </li>
  ) : (
    <li className={styles.item} data-tone="success">
      <CheckCircleIcon size={14} />
      {t.t('status.noIssues')}
    </li>
  );
}

function CursorPosition() {
  const t = useT();
  const point = useCursorPoint();
  return (
    <li className={cx(styles.item, styles.cursor)} title={t.t('status.cursorTitle')}>
      <CursorIcon size={14} />
      {point ? (
        t.t('status.cursor', { x: t.metres(point.x), z: t.metres(point.z) })
      ) : (
        <>
          <span className={styles.empty} aria-hidden="true" />
          <span className="sr-only">{t.t('status.cursorNone')}</span>
        </>
      )}
    </li>
  );
}

function GridInfo() {
  const t = useT();
  return (
    <li className={cx(styles.item, styles.grid)}>
      <GridIcon size={14} />
      {t.t('status.grid', {
        cell: t.metres(FLOOR.cell),
        width: t.integer(FLOOR.width),
        depth: t.integer(FLOOR.depth),
      })}
    </li>
  );
}

function saveHint(t: Translator, status: SaveStatus): string {
  if (status === 'error') return t.t('notice.saveFailed');
  return status === 'off' ? t.t('status.saveOffHint') : t.t('status.saveHint');
}

function SaveIndicator() {
  const t = useT();
  const status = useEditor((state) => state.saveStatus);
  const failed = status === 'error';
  return (
    <li
      className={styles.item}
      data-tone={failed ? 'danger' : undefined}
      title={saveHint(t, status)}
    >
      {failed ? <WarningIcon size={14} /> : <CloudIcon size={14} />}
      {t.t(`status.save.${status}`)}
    </li>
  );
}

export function StatusBar() {
  const t = useT();
  return (
    <footer className={styles.bar} aria-label={t.t('status.label')}>
      <ul className={styles.list}>
        <ItemCount />
        <ClearanceIssues />
        <CursorPosition />
        <GridInfo />
        <SaveIndicator />
      </ul>
    </footer>
  );
}
