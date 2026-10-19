import { useId, type MouseEvent } from 'react';
import { CATALOG } from '../../domain/catalog';
import { ITEM_KINDS, type ItemKind } from '../../domain/types';
import { useT } from '../../i18n/useT';
import { cancelTool, placeAtGhost, startPlacement } from '../../state/actions';
import { useEditor } from '../../state/store';
import { cx } from '../../ui/cx';
import { KindIcon } from '../../ui/icons';
import { Kbd } from '../../ui/Kbd';
import { Section } from '../../ui/Section';
import { shortcutHint } from '../shortcuts/shortcuts';
import { useShortcutStore } from '../shortcuts/shortcutStore';
import styles from './Palette.module.css';

function pick(kind: ItemKind, active: boolean, event: MouseEvent<HTMLButtonElement>): void {
  const fromKeyboard = event.detail === 0;
  if (active && fromKeyboard) {
    placeAtGhost({ keepPlacing: event.shiftKey });
  } else if (active && !event.shiftKey) {
    cancelTool();
  } else {
    startPlacement(kind, { sticky: event.shiftKey });
  }
}

interface KindCardProps {
  readonly kind: ItemKind;
  readonly active: boolean;
  readonly singleKeys: boolean;
}

function KindCard({ kind, active, singleKeys }: KindCardProps) {
  const t = useT();
  const sizeId = useId();
  const spec = CATALOG[kind];
  const hotkey = shortcutHint(`pick-${kind}`, singleKeys);
  const width = t.metres(spec.width);
  const depth = t.metres(spec.depth);
  const height = t.metres(spec.height);

  return (
    <li className={cx(styles.card, styles[kind])}>
      <span className={styles.top} aria-hidden="true">
        <span className={styles.chip}>
          <KindIcon kind={kind} />
        </span>
        {hotkey ? <Kbd>{hotkey.label}</Kbd> : null}
      </span>
      <button
        type="button"
        className={styles.name}
        aria-pressed={active}
        aria-describedby={sizeId}
        aria-keyshortcuts={hotkey?.aria}
        title={t.t('palette.details', { name: t.kindName(kind), partNumber: spec.partNumber })}
        onClick={(event) => {
          pick(kind, active, event);
        }}
      >
        {t.kindShort(kind)}
      </button>
      <span className={styles.size} aria-hidden="true">
        <span className={styles.dimension}>{t.decimal(spec.width)}</span>
        <span className={styles.dimension}>{t.decimal(spec.depth)}</span>
        <span className={styles.dimension}>{height}</span>
      </span>
      <span id={sizeId} className="sr-only">
        {t.t('palette.size', { width, depth, height })}
      </span>
    </li>
  );
}

export function Palette() {
  const t = useT();
  const placingKind = useEditor((state) => (state.tool.type === 'place' ? state.tool.kind : null));
  const singleKeys = useShortcutStore((state) => state.singleKeys);
  return (
    <Section title={t.t('palette.title')} className={styles.palette} bodyClassName={styles.body}>
      <ul className={styles.grid}>
        {ITEM_KINDS.map((kind) => (
          <KindCard key={kind} kind={kind} active={placingKind === kind} singleKeys={singleKeys} />
        ))}
      </ul>
      <p className={styles.hint}>{t.t('palette.hint')}</p>
    </Section>
  );
}
