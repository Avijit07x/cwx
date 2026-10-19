import { useT } from '../i18n/useT';
import { cx } from '../ui/cx';
import styles from './Viewport.module.css';

const ENTRIES = [
  { label: 'viewport.legend.selected', swatch: styles.swatchSelected },
  { label: 'viewport.legend.violation', swatch: styles.swatchViolation },
  { label: 'viewport.legend.ghost', swatch: styles.swatchGhost },
  { label: 'viewport.legend.tooClose', swatch: styles.swatchTooClose },
  { label: 'viewport.legend.proposal', swatch: styles.swatchProposal },
] as const;

export function Legend() {
  const t = useT();
  return (
    <section className={cx(styles.panel, styles.legend)} aria-label={t.t('viewport.legend')}>
      <ul className={styles.legendList}>
        {ENTRIES.map((entry) => (
          <li key={entry.label} className={styles.legendItem}>
            <span className={cx(styles.swatch, entry.swatch)} aria-hidden="true" />
            {t.t(entry.label)}
          </li>
        ))}
      </ul>
    </section>
  );
}
