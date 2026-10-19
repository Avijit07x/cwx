import { useT } from '../i18n/useT';
import {
  focusSelection,
  setCameraView,
  toggleStats,
  turnCamera,
  zoomCamera,
} from '../state/actions';
import { useEditor, type CameraView } from '../state/store';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import {
  CubeIcon,
  FocusIcon,
  GaugeIcon,
  MinusIcon,
  PlanIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from '../ui/icons';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import styles from './Viewport.module.css';

type ViewChoice = CameraView | 'free';

interface ViewportControlsProps {
  readonly free: boolean;
  readonly singleKeys: boolean;
}

export function ViewportControls({ free, singleKeys }: ViewportControlsProps) {
  const t = useT();
  const view = useEditor((state) => state.camera.view);
  const hasSelection = useEditor((state) => state.selectedId !== null);
  const showStats = useEditor((state) => state.showStats);
  const singleKey = (label: string, aria: string) =>
    singleKeys ? { shortcut: label, ariaShortcut: aria } : {};

  const options: readonly SegmentedOption<ViewChoice>[] = [
    {
      value: 'perspective',
      title: t.t('viewport.view.perspectiveTitle'),
      label: (
        <span className={styles.viewOption}>
          <CubeIcon size={14} />
          {t.t('viewport.view.perspective')}
        </span>
      ),
    },
    {
      value: 'top',
      title: t.t('viewport.view.topTitle'),
      label: (
        <span className={styles.viewOption}>
          <PlanIcon size={14} />
          {t.t('viewport.view.top')}
        </span>
      ),
    },
  ];

  return (
    <div
      className={cx(styles.panel, styles.controls)}
      role="group"
      aria-label={t.t('viewport.controls')}
    >
      <Segmented
        legend={t.t('viewport.view.legend')}
        options={options}
        value={free ? 'free' : view}
        size="sm"
        onChange={(choice) => {
          if (choice !== 'free') setCameraView(choice);
        }}
      />
      <span className={styles.divider} aria-hidden="true" />
      <IconButton
        label={t.t('viewport.zoomIn')}
        icon={<PlusIcon />}
        {...singleKey(t.t('viewport.key.zoomIn'), 'Plus')}
        size="sm"
        tooltip="bottom-end"
        onClick={() => {
          zoomCamera('in');
        }}
      />
      <IconButton
        label={t.t('viewport.zoomOut')}
        icon={<MinusIcon />}
        {...singleKey(t.t('viewport.key.zoomOut'), '-')}
        size="sm"
        tooltip="bottom-end"
        onClick={() => {
          zoomCamera('out');
        }}
      />
      <IconButton
        label={t.t('viewport.turnLeft')}
        icon={<RotateCcwIcon />}
        size="sm"
        tooltip="bottom-end"
        onClick={() => {
          turnCamera(-1);
        }}
      />
      <IconButton
        label={t.t('viewport.turnRight')}
        icon={<RotateCwIcon />}
        size="sm"
        tooltip="bottom-end"
        onClick={() => {
          turnCamera(1);
        }}
      />
      <IconButton
        label={t.t('viewport.focus')}
        icon={<FocusIcon />}
        {...singleKey(t.t('viewport.key.focus'), 'F')}
        size="sm"
        tooltip="bottom-end"
        disabled={!hasSelection}
        onClick={focusSelection}
      />
      <IconButton
        label={t.t('viewport.stats')}
        icon={<GaugeIcon />}
        size="sm"
        tooltip="bottom-end"
        pressed={showStats}
        onClick={toggleStats}
      />
    </div>
  );
}
