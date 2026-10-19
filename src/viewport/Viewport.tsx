import { Canvas, type Dpr } from '@react-three/fiber';
import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { WebGLRendererParameters } from 'three';
import { useT } from '../i18n/useT';
import { isMac } from '../platform';
import { useEditor } from '../state/store';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { StateMessage } from '../ui/StateMessage';
import { CAMERA_FOV } from './camera';
import { pageScrollsOverView } from './interaction';
import { Legend } from './Legend';
import { PIXEL_RATIO } from './perf';
import { PerfHud } from './PerfHud';
import { Scene } from './Scene';
import { StatusBanner } from './StatusBanner';
import styles from './Viewport.module.css';
import { ViewportControls } from './ViewportControls';
import { isWebGLAvailable } from './webgl';

const GL_OPTIONS: WebGLRendererParameters = {
  antialias: true,
  powerPreference: 'high-performance',
};

interface StageProps {
  readonly onUserCameraMove: () => void;
  readonly onContextLost: () => void;
}

const Stage = memo(function Stage({ onUserCameraMove, onContextLost }: StageProps) {
  const showStats = useEditor((state) => state.showStats);
  const [dpr, setDpr] = useState<Dpr>(PIXEL_RATIO);
  return (
    <Canvas
      className={styles.canvas}
      frameloop={showStats ? 'always' : 'demand'}
      dpr={dpr}
      gl={GL_OPTIONS}
      flat
      camera={{ fov: CAMERA_FOV, near: 0.1, far: 400, position: [10, 24, 34] }}
    >
      <Scene
        onUserCameraMove={onUserCameraMove}
        onContextLost={onContextLost}
        onDprChange={setDpr}
      />
    </Canvas>
  );
});

function LiveViewport({
  singleKeys,
  onContextLost,
}: {
  readonly singleKeys: boolean;
  readonly onContextLost: () => void;
}) {
  const showStats = useEditor((state) => state.showStats);
  const [movedAt, setMovedAt] = useState<number | null>(null);
  const free = useEditor((state) => movedAt === state.camera.seq || state.camera.focusId !== null);
  const handleUserMove = useCallback(() => {
    setMovedAt(useEditor.getState().camera.seq);
  }, []);

  return (
    <>
      <Stage onUserCameraMove={handleUserMove} onContextLost={onContextLost} />
      <div className={styles.layer}>
        <div className={cx(styles.topRow, showStats && styles.withHud)}>
          <div className={styles.topStart}>{showStats && <PerfHud />}</div>
          <StatusBanner singleKeys={singleKeys} />
          <div className={styles.topEnd}>
            <ViewportControls free={free} singleKeys={singleKeys} />
          </div>
        </div>
        <Legend />
      </div>
    </>
  );
}

const ZOOM_HINT_MS = 1500;

function blockPageZoom(event: Event) {
  event.preventDefault();
}

export default function Viewport({ singleKeys }: { readonly singleKeys: boolean }) {
  const t = useT();
  const instructionsId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [webgl] = useState(isWebGLAvailable);
  const [generation, setGeneration] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);
  const live = webgl && !contextLost;
  const handleContextLost = useCallback(() => {
    setContextLost(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !live) return;
    let hideHint: number | undefined;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
      if (event.ctrlKey || event.metaKey || !pageScrollsOverView()) return;
      setZoomHint(true);
      window.clearTimeout(hideHint);
      hideHint = window.setTimeout(() => {
        setZoomHint(false);
      }, ZOOM_HINT_MS);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('gesturestart', blockPageZoom);
    root.addEventListener('gesturechange', blockPageZoom);
    return () => {
      window.clearTimeout(hideHint);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('gesturestart', blockPageZoom);
      root.removeEventListener('gesturechange', blockPageZoom);
    };
  }, [live]);

  const reload = () => {
    rootRef.current?.focus({ preventScroll: true });
    setContextLost(false);
    setGeneration((value) => value + 1);
  };

  let content: ReactNode;
  if (!webgl) {
    content = (
      <StateMessage
        title={t.t('viewport.unavailable.title')}
        body={t.t('viewport.unavailable.body')}
      />
    );
  } else if (contextLost) {
    content = (
      <StateMessage
        role="alert"
        title={t.t('viewport.lost.title')}
        body={t.t('viewport.lost.body')}
        action={
          <Button size="sm" onClick={reload}>
            {t.t('viewport.lost.reload')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <LiveViewport key={generation} singleKeys={singleKeys} onContextLost={handleContextLost} />
    );
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      tabIndex={0}
      role="group"
      aria-roledescription={t.t('viewport.roleDescription')}
      aria-label={t.t('viewport.label')}
      aria-describedby={instructionsId}
    >
      <p id={instructionsId} className="sr-only">
        {t.t(singleKeys ? 'viewport.instructions' : 'viewport.instructionsNoSingleKeys')}
      </p>
      {content}
      {zoomHint && live && (
        <p className={styles.zoomHint} aria-hidden="true">
          {t.t('viewport.zoomHint', { key: isMac ? '⌘' : 'Ctrl' })}
        </p>
      )}
    </div>
  );
}
