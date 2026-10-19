import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  createFrameMeter,
  frameStats,
  PERF_PUBLISH_INTERVAL_MS,
  publishPerf,
  readGpuName,
  readHeapBytes,
} from './perf';

export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const meter = useMemo(() => createFrameMeter(), []);
  const gpu = useMemo(() => readGpuName(gl.getContext()), [gl]);
  const lastPublish = useRef<number | null>(null);

  useEffect(
    () => () => {
      publishPerf(null);
    },
    [],
  );

  useFrame(() => {
    const now = performance.now();
    meter.record(now);
    lastPublish.current ??= now;
    if (now - lastPublish.current < PERF_PUBLISH_INTERVAL_MS) return;
    lastPublish.current = now;
    const { render, memory } = gl.info;
    publishPerf({
      frames: frameStats(meter.intervals(now)),
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      heapBytes: readHeapBytes(),
      gpu,
      width: gl.domElement.clientWidth,
      height: gl.domElement.clientHeight,
      dpr: gl.getPixelRatio(),
    });
  });

  return null;
}
