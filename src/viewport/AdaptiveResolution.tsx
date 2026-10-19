import { PerformanceMonitor, type CameraControlsImpl } from '@react-three/drei';
import type { Dpr } from '@react-three/fiber';
import { useEffect, useState, type RefObject } from 'react';
import { useEditor } from '../state/store';
import { adaptivePixelRatio, PIXEL_RATIO } from './perf';

const SAMPLES_PER_DECISION = 4;
const FPS_BUDGET = 50;

function frameRateBounds(refreshRate: number): [lower: number, upper: number] {
  return refreshRate > 100 ? [60, 100] : [FPS_BUDGET, 60];
}

interface AdaptiveResolutionProps {
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
  readonly onDprChange: (dpr: Dpr) => void;
}

export function AdaptiveResolution({ controlsRef, onDprChange }: AdaptiveResolutionProps) {
  const renderingContinuously = useEditor((state) => state.showStats);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [factor, setFactor] = useState(1);
  const measuring = renderingContinuously || cameraMoving;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const wake = () => {
      setCameraMoving(true);
    };
    const sleep = () => {
      setCameraMoving(false);
    };
    controls.addEventListener('wake', wake);
    controls.addEventListener('sleep', sleep);
    return () => {
      controls.removeEventListener('wake', wake);
      controls.removeEventListener('sleep', sleep);
    };
  }, [controlsRef]);

  useEffect(() => {
    onDprChange(measuring ? adaptivePixelRatio(factor, window.devicePixelRatio) : PIXEL_RATIO);
  }, [measuring, factor, onDprChange]);

  if (!measuring) return null;
  return (
    <PerformanceMonitor
      factor={factor}
      iterations={SAMPLES_PER_DECISION}
      bounds={frameRateBounds}
      onChange={(api) => {
        setFactor(api.factor);
      }}
    />
  );
}
