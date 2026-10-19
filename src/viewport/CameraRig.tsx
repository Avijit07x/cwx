import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useStore, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { MathUtils, PerspectiveCamera, Raycaster, Spherical, Vector3 } from 'three';
import type { Point } from '../domain/types';
import { selectEffectiveIndex } from '../state/selectors';
import { useEditor, type CameraState, type TurnDirection } from '../state/store';
import {
  CAMERA_SMOOTH_TIME,
  focusPose,
  lookAtArgs,
  MAX_DISTANCE,
  MIN_DISTANCE,
  POLAR_LIMIT,
  presetPose,
  ROOM_BOUNDS,
  TURN_STEP,
  wheelZoomFactor,
  ZOOM_STEP,
  zoomPose,
  type Pose,
} from './camera';
import {
  intersectFloor,
  pageScrollsOverView,
  rayFromPointer,
  type ScreenPoint,
} from './interaction';

const { ACTION } = CameraControlsImpl;
const MOUSE_BUTTONS = {
  left: ACTION.ROTATE,
  middle: ACTION.DOLLY,
  right: ACTION.SCREEN_PAN,
  wheel: ACTION.NONE,
};
const TOUCHES = {
  one: ACTION.TOUCH_ROTATE,
  two: ACTION.TOUCH_SCREEN_PAN,
  three: ACTION.TOUCH_SCREEN_PAN,
};
const FIRST_FRAME_DELTA_S = 1 / 60;

class OnDemandCameraControls extends CameraControlsImpl {
  private moving = false;

  override update(delta: number): boolean {
    this.moving = super.update(this.moving ? delta : Math.min(delta, FIRST_FRAME_DELTA_S));
    return this.moving;
  }
}

const spherical = new Spherical();
const target = new Vector3();

function currentPose(controls: CameraControlsImpl): Pose {
  const { radius, phi, theta } = controls.getSpherical(spherical);
  const { x, y, z } = controls.getTarget(target);
  return { target: { x, y, z }, radius, phi, theta };
}

function requestedPose(
  request: CameraState,
  camera: PerspectiveCamera,
  controls: CameraControlsImpl,
): Pose | null {
  if (request.focusId === null) return presetPose(request.view, camera.fov, camera.aspect);
  const item = selectEffectiveIndex(useEditor.getState()).get(request.focusId);
  return item ? focusPose(currentPose(controls), item) : null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function turnView(controls: CameraControlsImpl, direction: TurnDirection): void {
  void controls.rotate(direction * TURN_STEP, 0, !prefersReducedMotion());
  controls.dispatchEvent({ type: 'control' });
}

type ZoomAround = (factor: number, anchor: ScreenPoint | null) => boolean;

function zoomer(
  element: HTMLElement,
  camera: PerspectiveCamera,
  controls: CameraControlsImpl,
): ZoomAround {
  const raycaster = new Raycaster();
  const floorUnder = (point: ScreenPoint | null): Point | null =>
    point ? intersectFloor(rayFromPointer(raycaster, point, element, camera)) : null;
  return (factor, anchor) => {
    const current = currentPose(controls);
    const next = zoomPose(current, factor, floorUnder(anchor));
    if (next.radius === current.radius) return false;
    const animate = !prefersReducedMotion();
    void controls.dollyTo(next.radius, animate);
    void controls.moveTo(next.target.x, next.target.y, next.target.z, animate);
    controls.dispatchEvent({ type: 'control' });
    return true;
  };
}

interface SafariGesture {
  readonly scale: number;
  readonly at: ScreenPoint | null;
}

function screenPointOf(event: Event): ScreenPoint | null {
  if (!('clientX' in event && 'clientY' in event)) return null;
  const { clientX, clientY } = event;
  return typeof clientX === 'number' && typeof clientY === 'number' ? { clientX, clientY } : null;
}

function readSafariGesture(event: Event): SafariGesture | null {
  if (!('scale' in event)) return null;
  const scale = event.scale;
  return typeof scale === 'number' && scale > 0 ? { scale, at: screenPointOf(event) } : null;
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
}

function attachZoomInput(
  element: HTMLElement,
  controls: CameraControlsImpl,
  zoomAround: ZoomAround,
): () => void {
  const touches = new Map<number, ScreenPoint>();
  let pinchSpan: number | null = null;
  let gestureScale: number | null = null;

  const fingers = (): readonly [ScreenPoint, ScreenPoint] | null => {
    if (touches.size !== 2) return null;
    const [first, second] = [...touches.values()];
    return first && second ? [first, second] : null;
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey && pageScrollsOverView()) return;
    event.preventDefault();
    const duplicateOfGesture = event.ctrlKey && gestureScale !== null;
    if (controls.enabled && !duplicateOfGesture) zoomAround(wheelZoomFactor(event), event);
  };

  const onGestureStart = (event: Event) => {
    event.preventDefault();
    gestureScale = readSafariGesture(event)?.scale ?? 1;
  };

  const onGestureChange = (event: Event) => {
    event.preventDefault();
    const gesture = readSafariGesture(event);
    if (!gesture || gestureScale === null) return;
    const factor = gestureScale / gesture.scale;
    gestureScale = gesture.scale;
    if (controls.enabled && touches.size === 0) zoomAround(factor, gesture.at);
  };

  const onGestureEnd = (event: Event) => {
    event.preventDefault();
    gestureScale = null;
  };

  const trackFingers = () => {
    const pair = fingers();
    pinchSpan = pair ? distance(...pair) : null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    trackFingers();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const pair = fingers();
    if (!pair || pinchSpan === null) return;
    const span = distance(...pair);
    if (span === 0) return;
    const factor = pinchSpan / span;
    pinchSpan = span;
    if (controls.enabled) zoomAround(factor, midpoint(...pair));
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (!touches.delete(event.pointerId)) return;
    trackFingers();
  };

  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('gesturestart', onGestureStart);
  element.addEventListener('gesturechange', onGestureChange);
  element.addEventListener('gestureend', onGestureEnd);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  return () => {
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('gesturestart', onGestureStart);
    element.removeEventListener('gesturechange', onGestureChange);
    element.removeEventListener('gestureend', onGestureEnd);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerEnd);
    element.removeEventListener('pointercancel', onPointerEnd);
  };
}

function writeData(
  element: HTMLElement,
  key: 'cameraDistance' | 'cameraTarget' | 'cameraAzimuth',
  value: string,
) {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

function publishCameraForTests(element: HTMLElement, controls: CameraControlsImpl): () => void {
  const shown = new Vector3();
  const publish = () => {
    const { x, z } = controls.getTarget(shown, false);
    writeData(element, 'cameraDistance', controls.distance.toFixed(2));
    writeData(element, 'cameraTarget', `${x.toFixed(2)} ${z.toFixed(2)}`);
    writeData(element, 'cameraAzimuth', MathUtils.radToDeg(controls.azimuthAngle).toFixed(1));
  };
  controls.addEventListener('update', publish);
  return () => {
    controls.removeEventListener('update', publish);
  };
}

interface CameraRigProps {
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
  readonly onUserMove: () => void;
}

export function CameraRig({ controlsRef, onUserMove }: CameraRigProps) {
  const store = useStore();
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const userMoved = useRef(false);

  const handleControl = useCallback(() => {
    userMoved.current = true;
    onUserMove();
  }, [onUserMove]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !(camera instanceof PerspectiveCamera)) return;
    controls.setBoundary(ROOM_BOUNDS);
    const zoomAround = zoomer(gl.domElement, camera, controls);
    const detachZoomInput = attachZoomInput(gl.domElement, controls, zoomAround);
    const stopPublishing = publishCameraForTests(gl.domElement, controls);

    const moveTo = (request: CameraState, animate: boolean) => {
      const pose = requestedPose(request, camera, controls);
      if (!pose) return;
      userMoved.current = false;
      void controls.setLookAt(...lookAtArgs(pose), animate && !prefersReducedMotion());
      controls.normalizeRotations();
      invalidate();
    };

    const zoomStep = (request: CameraState) => {
      const factor = request.zoom === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP;
      if (!zoomAround(factor, null)) controls.dispatchEvent({ type: 'control' });
    };

    moveTo(useEditor.getState().camera, false);
    const unsubscribe = useEditor.subscribe(
      (state) => state.camera,
      (request) => {
        if (request.turn !== null) turnView(controls, request.turn);
        else if (request.zoom === null) moveTo(request, true);
        else zoomStep(request);
      },
    );
    const unsubscribeSize = store.subscribe((state, previous) => {
      const request = useEditor.getState().camera;
      if (state.size === previous.size || userMoved.current || request.focusId !== null) return;
      moveTo(request, false);
    });

    return () => {
      detachZoomInput();
      stopPublishing();
      unsubscribe();
      unsubscribeSize();
    };
  }, [store, camera, gl, invalidate, controlsRef]);

  return (
    <CameraControls
      ref={controlsRef}
      impl={OnDemandCameraControls}
      domElement={gl.domElement}
      mouseButtons={MOUSE_BUTTONS}
      touches={TOUCHES}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      maxPolarAngle={POLAR_LIMIT}
      smoothTime={CAMERA_SMOOTH_TIME}
      onControl={handleControl}
    />
  );
}
