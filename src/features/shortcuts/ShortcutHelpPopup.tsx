import { Dialog } from '@base-ui/react/dialog';
import { Fragment, useId } from 'react';
import { useT } from '../../i18n/useT';
import { IconButton } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { CloseIcon } from '../../ui/icons';
import { Kbd } from '../../ui/Kbd';
import { Switch } from '../../ui/Switch';
import styles from './ShortcutHelpPopup.module.css';
import {
  comboLabel,
  isSingleKeyShortcut,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  SINGLE_KEY_LABELS,
  type ShortcutGroup,
} from './shortcuts';
import { setSingleKeyShortcuts, useShortcutStore } from './shortcutStore';

interface GroupListProps {
  readonly group: ShortcutGroup;
  readonly singleKeys: boolean;
}

function GroupList({ group, singleKeys }: GroupListProps) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <h3 id={headingId} className={styles.groupTitle}>
        {t.t(`shortcuts.group.${group}`)}
      </h3>
      <dl>
        {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => {
          const off = !singleKeys && isSingleKeyShortcut(shortcut);
          return (
            <div key={shortcut.id} className={cx(styles.row, off && styles.off)}>
              <dt className={styles.action}>{shortcut.describe(t)}</dt>
              <dd className={styles.keys}>
                {shortcut.combos.map((combo, index) => (
                  <Fragment key={comboLabel(combo)}>
                    {index > 0 && <span className="sr-only">{` ${t.t('shortcuts.or')} `}</span>}
                    <Kbd>{comboLabel(combo)}</Kbd>
                  </Fragment>
                ))}
                {off && <span className={styles.offBadge}>{t.t('shortcuts.off')}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function SingleKeySwitch() {
  const t = useT();
  const singleKeys = useShortcutStore((state) => state.singleKeys);
  const switchId = useId();
  const keysId = useId();
  const hintId = useId();
  return (
    <div className={styles.footer}>
      <Switch
        id={switchId}
        checked={singleKeys}
        onCheckedChange={setSingleKeyShortcuts}
        aria-describedby={`${keysId} ${hintId}`}
      />
      <div className={styles.switchText}>
        <label htmlFor={switchId} className={styles.switchLabel}>
          {t.t('shortcuts.singleKey')}
        </label>
        <p id={keysId} className={styles.singleKeys}>
          {SINGLE_KEY_LABELS.map((label, index) => (
            <Fragment key={label}>
              {index > 0 && ' '}
              <Kbd>{label}</Kbd>
            </Fragment>
          ))}
        </p>
        <p id={hintId} className={styles.hint}>
          {t.t('shortcuts.singleKeyHint')}
        </p>
      </div>
    </div>
  );
}

export default function ShortcutHelpPopup() {
  const t = useT();
  const singleKeys = useShortcutStore((state) => state.singleKeys);
  return (
    <>
      <Dialog.Backdrop className={styles.backdrop} />
      <Dialog.Viewport className={styles.viewport}>
        <Dialog.Popup className={styles.dialog}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{t.t('shortcuts.title')}</Dialog.Title>
            <Dialog.Close
              render={
                <IconButton label={t.t('common.close')} icon={<CloseIcon />} tooltip="none" />
              }
            />
          </div>
          <div
            role="region"
            tabIndex={0}
            aria-label={t.t('shortcuts.list')}
            className={styles.body}
          >
            {SHORTCUT_GROUPS.map((group) => (
              <GroupList key={group} group={group} singleKeys={singleKeys} />
            ))}
          </div>
          <SingleKeySwitch />
        </Dialog.Popup>
      </Dialog.Viewport>
    </>
  );
}
