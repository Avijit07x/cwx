import {
  CameraControlsImpl,
  type PerformanceMonitorApi,
  type PerformanceMonitorProps,
} from '@react-three/drei';
import { act, render } from '@testing-library/react';
import * as THREE from 'three';
import { beforeEach, expect, it, vi } from 'vitest';
import { toggleStats } from '../state/actions';
import { resetEditor } from '../state/store';
import { AdaptiveResolution } from './AdaptiveResolution';
import { adaptivePixelRatio, PIXEL_RATIO } from './perf';

const monitor = vi.hoisted(() => {
  const latest: { props: PerformanceMonitorProps | null } = { props: null };
  return latest;
});

vi.mock('@react-three/drei', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/drei')>()),
  PerformanceMonitor: (props: PerformanceMonitorProps) => {
    monitor.props = props;
    return null;
  },
}));

CameraControlsImpl.install({ THREE });

function measured(factor: number): PerformanceMonitorApi {
  return {
    fps: 30,
    factor,
    refreshrate: 60,
    frames: [],
    averages: [],
    index: 0,
    flipped: 1,
    fallback: false,
    subscriptions: new Map(),
    subscribe: () => () => undefined,
  };
}

beforeEach(() => {
  resetEditor([]);
  monitor.props = null;
});

it('lowers the resolution only while the camera moves and keeps the factor for the next move', () => {
  const controls = new CameraControlsImpl(new THREE.PerspectiveCamera());
  const onDprChange = vi.fn();
  render(<AdaptiveResolution controlsRef={{ current: controls }} onDprChange={onDprChange} />);
  expect(monitor.props).toBeNull();

  act(() => {
    controls.dispatchEvent({ type: 'wake' });
  });
  act(() => {
    monitor.props?.onChange?.(measured(0.5));
  });
  const lowered = adaptivePixelRatio(0.5, window.devicePixelRatio);
  expect(onDprChange).toHaveBeenLastCalledWith(lowered);

  act(() => {
    controls.dispatchEvent({ type: 'sleep' });
  });
  expect(onDprChange).toHaveBeenLastCalledWith(PIXEL_RATIO);

  act(() => {
    controls.dispatchEvent({ type: 'wake' });
  });
  expect(onDprChange).toHaveBeenLastCalledWith(lowered);
  expect(monitor.props?.factor).toBe(0.5);
});

it('steps the resolution down below the 50 fps budget on displays up to 100 Hz', () => {
  toggleStats();
  render(
    <AdaptiveResolution
      controlsRef={{ current: new CameraControlsImpl(new THREE.PerspectiveCamera()) }}
      onDprChange={vi.fn()}
    />,
  );
  expect(monitor.props?.bounds?.(60)).toEqual([50, 60]);
  expect(monitor.props?.bounds?.(120)).toEqual([60, 100]);
});
