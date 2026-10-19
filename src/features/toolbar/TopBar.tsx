import { Toolbar } from '@base-ui/react/toolbar';
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { describeEdit } from '../../i18n/describe';
import { LOCALE_LABEL, LOCALES } from '../../i18n/locales';
import { useT } from '../../i18n/useT';
import {
  clearLayout,
  duplicateSelection,
  redo,
  removeSelection,
  rotateSelection,
  setInspectorTab,
  setLocale,
  undo,
} from '../../state/actions';
import { selectNextRedo, selectNextUndo } from '../../state/selectors';
import { useEditor } from '../../state/store';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/cx';
import {
  ClearIcon,
  CubeIcon,
  DuplicateIcon,
  KeyboardIcon,
  RedoIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SparkleIcon,
  TrashIcon,
  UndoIcon,
} from '../../ui/icons';
import { Segmented } from '../../ui/Segmented';
import { Tooltip } from '../../ui/Tooltip';
import { ShortcutHelpDialog } from '../shortcuts/ShortcutHelpDialog';
import { shortcutHint, type ShortcutHint, type ShortcutId } from '../shortcuts/shortcuts';
import { useShortcutStore } from '../shortcuts/shortcutStore';
import styles from './TopBar.module.css';

export const COMPACT_TOOLBAR_QUERY = '(max-width: 640px)';
const ICON_ONLY_QUERY = '(max-width: 1100px)';

function supportsMediaQueries(): boolean {
  return typeof window.matchMedia === 'function';
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supportsMediaQueries()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supportsMediaQueries() && window.matchMedia(query).matches,
  );
}

function useShortcutHint(id: ShortcutId): ShortcutHint | undefined {
  const singleKeys = useShortcutStore((state) => state.singleKeys);
  return shortcutHint(id, singleKeys);
}

interface ToolButtonProps {
  readonly shortcut: ShortcutId;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

function ToolButton({ shortcut, label, icon, disabled, onClick }: ToolButtonProps) {
  const hint = useShortcutHint(shortcut);
  return (
    <Toolbar.Button
      disabled={disabled}
      onClick={onClick}
      render={
        <IconButton label={label} icon={icon} shortcut={hint?.label} ariaShortcut={hint?.aria} />
      }
    />
  );
}

function Brand({ embedded }: { readonly embedded: boolean }) {
  const t = useT();
  const hostProjectName = useEditor((state) => state.session.projectName);
  const userName = useEditor((state) => state.session.userName);
  const projectName = embedded ? hostProjectName : t.t('toolbar.sampleProject');
  return (
    <div className={styles.brand}>
      <span className={styles.mark} aria-hidden="true">
        <CubeIcon size={14} />
      </span>
      <h1 className={styles.appName}>{t.t('app.name')}</h1>
      <span className={styles.separator} aria-hidden="true" />
      <p className={styles.context}>
        <span className={styles.project} title={projectName}>
          <span className="sr-only">{t.t('toolbar.project', { name: projectName })}</span>
          <span aria-hidden="true">{projectName}</span>
        </span>
        {userName ? (
          <>
            {' '}
            <span className={styles.user} title={userName}>
              <span className="sr-only">{t.t('toolbar.signedInAs', { name: userName })}</span>
              <span aria-hidden="true">{userName}</span>
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function SelectionTools() {
  const t = useT();
  const hasSelection = useEditor((state) => state.selectedId !== null);
  const canRotate = useEditor((state) => state.selectedId !== null || state.tool.type === 'place');
  return (
    <>
      <ToolButton
        shortcut="rotate-ccw"
        label={t.t('toolbar.rotateCcw')}
        icon={<RotateCcwIcon />}
        disabled={!canRotate}
        onClick={() => {
          rotateSelection(-1);
        }}
      />
      <ToolButton
        shortcut="rotate-cw"
        label={t.t('toolbar.rotateCw')}
        icon={<RotateCwIcon />}
        disabled={!canRotate}
        onClick={() => {
          rotateSelection(1);
        }}
      />
      <ToolButton
        shortcut="duplicate"
        label={t.t('toolbar.duplicate')}
        icon={<DuplicateIcon />}
        disabled={!hasSelection}
        onClick={duplicateSelection}
      />
      <ToolButton
        shortcut="delete"
        label={t.t('toolbar.delete')}
        icon={<TrashIcon />}
        disabled={!hasSelection}
        onClick={removeSelection}
      />
      <Toolbar.Separator className={styles.divider} />
    </>
  );
}

function EditToolbar() {
  const t = useT();
  const compact = useMediaQuery(COMPACT_TOOLBAR_QUERY);
  const iconOnly = useMediaQuery(ICON_ONLY_QUERY);
  const nextUndo = useEditor(selectNextUndo);
  const nextRedo = useEditor(selectNextRedo);
  const isEmpty = useEditor((state) => state.items.length === 0);
  const clearLabel = t.t('toolbar.clear');

  return (
    <Toolbar.Root aria-label={t.t('toolbar.label')} className={styles.toolbar}>
      <ToolButton
        shortcut="undo"
        label={
          nextUndo
            ? t.t('toolbar.undoAction', { action: describeEdit(t, nextUndo.label) })
            : t.t('toolbar.undo')
        }
        icon={<UndoIcon />}
        disabled={!nextUndo}
        onClick={undo}
      />
      <ToolButton
        shortcut="redo"
        label={
          nextRedo
            ? t.t('toolbar.redoAction', { action: describeEdit(t, nextRedo.label) })
            : t.t('toolbar.redo')
        }
        icon={<RedoIcon />}
        disabled={!nextRedo}
        onClick={redo}
      />
      <Toolbar.Separator className={styles.divider} />
      {compact ? null : <SelectionTools />}
      <Tooltip content={clearLabel} disabled={!iconOnly}>
        <Toolbar.Button
          disabled={isEmpty}
          onClick={clearLayout}
          render={
            <Button variant="ghost" icon={<ClearIcon />} className={styles.collapsible}>
              <span className={styles.label}>{clearLabel}</span>
            </Button>
          }
        />
      </Tooltip>
    </Toolbar.Root>
  );
}

function LanguageSwitch() {
  const t = useT();
  return (
    <Segmented
      legend={t.t('toolbar.language')}
      value={t.locale}
      onChange={setLocale}
      options={LOCALES.map((locale) => ({
        value: locale,
        title: LOCALE_LABEL[locale].name,
        label: (
          <>
            <span aria-hidden="true">{LOCALE_LABEL[locale].short}</span>
            <span className="sr-only" lang={locale}>
              {LOCALE_LABEL[locale].name}
            </span>
          </>
        ),
      }))}
    />
  );
}

function AssistantToggle() {
  const t = useT();
  const iconOnly = useMediaQuery(ICON_ONLY_QUERY);
  const active = useEditor((state) => state.inspectorTab === 'assistant');
  const label = t.t('toolbar.assistant');
  return (
    <Tooltip content={label} disabled={!iconOnly}>
      <Button
        variant="ghost"
        icon={<SparkleIcon className={styles.aiIcon} />}
        aria-pressed={active}
        className={cx(styles.collapsible, styles.assistantToggle)}
        onClick={() => {
          setInspectorTab(active ? 'inspect' : 'assistant');
        }}
      >
        <span className={styles.label}>{label}</span>
      </Button>
    </Tooltip>
  );
}

function HelpButton() {
  const t = useT();
  const hint = useShortcutHint('help');
  return (
    <ShortcutHelpDialog
      trigger={
        <IconButton
          label={t.t('shortcuts.title')}
          icon={<KeyboardIcon />}
          shortcut={hint?.label}
          ariaShortcut={hint?.aria}
          tooltip="bottom-end"
        />
      }
    />
  );
}

export function TopBar() {
  const embedded = useEditor((state) => state.session.embedded);
  return (
    <header className={styles.bar}>
      <Brand embedded={embedded} />
      <EditToolbar />
      <div className={styles.end}>
        {embedded ? null : <LanguageSwitch />}
        <AssistantToggle />
        <HelpButton />
      </div>
    </header>
  );
}
