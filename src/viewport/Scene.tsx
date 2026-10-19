import type { CameraControlsImpl } from '@react-three/drei';
import { useThree, type Dpr } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import { useEditor } from '../state/store';
import { AdaptiveResolution } from './AdaptiveResolution';
import { CameraRig } from './CameraRig';
import { releaseKindGeometries } from './geometry';
import { Ghosts } from './Ghosts';
import { Items } from './Items';
import { Overlays } from './Overlays';
import { COLORS } from './colors';
import { PerfProbe } from './PerfProbe';
import { attachPointerInteraction } from './pointer';
import { Room } from './Room';
import { SelectionTag } from './SelectionTag';
import { watchContextLoss } from './webgl';

const HEMISPHERE_INTENSITY = 2.3;
const SUN_INTENSITY = 1.1;

function PointerInteraction({
  controlsRef,
}: {
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  useEffect(
    () =>
      attachPointerInteraction({
        element: gl.domElement,
        camera,
        controls: () => controlsRef.current,
      }),
    [gl, camera, controlsRef],
  );
  return null;
}

function ContextLossWatcher({ onLost }: { readonly onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => watchContextLoss(gl.domElement, onLost), [gl, onLost]);
  return null;
}

interface SceneProps {
  readonly onUserCameraMove: () => void;
  readonly onContextLost: () => void;
  readonly onDprChange: (dpr: Dpr) => void;
}

export function Scene({ onUserCameraMove, onContextLost, onDprChange }: SceneProps) {
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const showStats = useEditor((state) => state.showStats);

  useEffect(
    () => () => {
      releaseKindGeometries();
    },
    [],
  );

  return (
    <>
      <color attach="background" args={[COLORS.background]} />
      <hemisphereLight args={[COLORS.sky, COLORS.ground, HEMISPHERE_INTENSITY]} />
      <directionalLight position={[-6, 14, 9]} intensity={SUN_INTENSITY} />
      <Room />
      <Items />
      <Overlays />
      <Ghosts />
      <SelectionTag />
      <CameraRig controlsRef={controlsRef} onUserMove={onUserCameraMove} />
      <AdaptiveResolution controlsRef={controlsRef} onDprChange={onDprChange} />
      <PointerInteraction controlsRef={controlsRef} />
      <ContextLossWatcher onLost={onContextLost} />
      {showStats && <PerfProbe />}
    </>
  );
}
