import { Canvas, useThree } from '@react-three/fiber';
import { memo, useEffect } from 'react';
import { Box3, PerspectiveCamera, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PIXEL_RATIO } from '../viewport/perf';
import type { BenchConfig } from './config';
import {
  buildCopies,
  disposeModel,
  frameCamera,
  setEnvironmentMap,
  type LoadedModel,
} from './copies';
import { readEnvironment, type EnvironmentInfo } from './environment';
import { createModelParser, fetchGlb } from './loader';
import { VARIANT_FILES } from './model';
import {
  BENCH_TIMINGS,
  runBenchmark,
  type BenchDriver,
  type BenchResult,
  type Progress,
} from './protocol';

export interface CompletedRun extends BenchResult {
  readonly environment: EnvironmentInfo;
}

export type RunEvent =
  | { readonly type: 'progress'; readonly progress: Progress }
  | { readonly type: 'complete'; readonly run: CompletedRun }
  | { readonly type: 'error'; readonly error: unknown };

interface SceneProps {
  readonly config: BenchConfig;
  readonly onEvent: (event: RunEvent) => void;
}

const CAMERA = { fov: 40, near: 0.05, far: 500 };
const ENVIRONMENT_BLUR = 0.04;

function BenchScene({ config, onEvent }: SceneProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const controller = new AbortController();
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, ENVIRONMENT_BLUR);
    room.dispose();
    pmrem.dispose();

    const parser = createModelParser(gl);
    const url = `${import.meta.env.BASE_URL}${VARIANT_FILES[config.model]}`;
    const pixel = new Uint8Array(4);
    let current: LoadedModel | null = null;
    let framed = false;

    const clear = () => {
      if (current) disposeModel(current);
      current = null;
    };

    const driver: BenchDriver<LoadedModel> = {
      now: () => performance.now(),
      nextFrame: () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        }),
      load: async (signal) => {
        const buffer = await fetchGlb(url, signal);
        const source = await parser.parse(buffer);
        setEnvironmentMap(source, environment.texture);
        return {
          content: buildCopies(source, config.copies, config.instancing),
          bytes: buffer.byteLength,
        };
      },
      show: (model) => {
        if (controller.signal.aborted) {
          disposeModel(model);
          return;
        }
        scene.add(model.root);
        current = model;
        if (!framed) {
          frameCamera(camera, new Box3().setFromObject(model.root));
          framed = true;
        }
      },
      clear,
      render: () => {
        const started = performance.now();
        gl.render(scene, camera);
        return {
          cpuMs: performance.now() - started,
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
        };
      },
      syncGpu: () => {
        const context = gl.getContext();
        context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      },
    };

    runBenchmark(
      driver,
      BENCH_TIMINGS,
      (progress) => {
        onEvent({ type: 'progress', progress });
      },
      controller.signal,
    ).then(
      (result) => {
        onEvent({ type: 'complete', run: { ...result, environment: readEnvironment(gl) } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) onEvent({ type: 'error', error });
      },
    );

    return () => {
      controller.abort();
      clear();
      parser.dispose();
      environment.dispose();
    };
  }, [camera, config, gl, onEvent, scene]);

  return null;
}

interface ViewportProps extends SceneProps {
  readonly running: boolean;
}

export const BenchViewport = memo(function BenchViewport({
  config,
  running,
  onEvent,
}: ViewportProps) {
  return (
    <Canvas camera={CAMERA} dpr={PIXEL_RATIO} frameloop={running ? 'never' : 'demand'}>
      <BenchScene config={config} onEvent={onEvent} />
    </Canvas>
  );
});
