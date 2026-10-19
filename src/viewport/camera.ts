import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { FLOOR } from '../domain/grid';
import type { Point } from '../domain/types';
import type { CameraView } from '../state/store';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Pose {
  readonly target: Vec3;
  readonly radius: number;
  readonly phi: number;
  readonly theta: number;
}

export const CAMERA_FOV = 40;
export const CAMERA_SMOOTH_TIME = 0.15;
export const MIN_DISTANCE = 4;
export const MAX_DISTANCE = 90;
export const POLAR_LIMIT = MathUtils.degToRad(82);
export const FOCUS_RADIUS = 12;

const WHEEL_ZOOM_PER_PIXEL = 0.002;
const PINCH_ZOOM_PER_PIXEL = 0.01;
const MAX_WHEEL_STEP = Math.log(1.25);
const PIXELS_PER_DELTA_UNIT: readonly number[] = [1, 40, 800];
const NOTCH_PIXELS = 100;
const MAC_NOTCH_PIXELS = 4.000244140625;
const MIN_WHOLE_PIXEL_NOTCH = 50;
const RECENTRE_PER_METRE = 0.5;

export const ZOOM_STEP = Math.exp(NOTCH_PIXELS * WHEEL_ZOOM_PER_PIXEL);
export const TURN_STEP = Math.PI / 4;

const VIEW_ANGLES: Readonly<Record<CameraView, { readonly phi: number; readonly theta: number }>> =
  {
    perspective: { phi: 0.92, theta: 0.38 },
    top: { phi: 1e-4, theta: 0 },
  };

const SCENE_BOUNDS = {
  minX: -0.2,
  maxX: FLOOR.width + 0.2,
  minZ: -1.6,
  maxZ: FLOOR.depth + 0.2,
  maxY: 2,
} as const;

export const ROOM_BOUNDS = new Box3(new Vector3(0, 0, 0), new Vector3(FLOOR.width, 0, FLOOR.depth));

const FIT_MARGIN = 0.9;
const FIT_STEPS = 40;

export function sceneCentre(): Vec3 {
  return {
    x: (SCENE_BOUNDS.minX + SCENE_BOUNDS.maxX) / 2,
    y: 0,
    z: (SCENE_BOUNDS.minZ + SCENE_BOUNDS.maxZ) / 2,
  };
}

export function sceneCorners(): Vec3[] {
  const { minX, maxX, minZ, maxZ, maxY } = SCENE_BOUNDS;
  return [0, maxY].flatMap((y) => [
    { x: minX, y, z: minZ },
    { x: maxX, y, z: minZ },
    { x: maxX, y, z: maxZ },
    { x: minX, y, z: maxZ },
  ]);
}

const probe = new PerspectiveCamera();
const offset = new Vector3();
const projected = new Vector3();

export function cameraPosition(pose: Pose): Vec3 {
  offset.setFromSphericalCoords(pose.radius, pose.phi, pose.theta);
  return { x: pose.target.x + offset.x, y: pose.target.y + offset.y, z: pose.target.z + offset.z };
}

export function fitsInView(
  pose: Pose,
  fov: number,
  aspect: number,
  points: readonly Vec3[],
  margin = FIT_MARGIN,
): boolean {
  const position = cameraPosition(pose);
  probe.fov = fov;
  probe.aspect = aspect;
  probe.near = 0.1;
  probe.far = 1000;
  probe.updateProjectionMatrix();
  probe.position.set(position.x, position.y, position.z);
  probe.lookAt(pose.target.x, pose.target.y, pose.target.z);
  probe.updateMatrixWorld();
  return points.every((point) => {
    projected.set(point.x, point.y, point.z).project(probe);
    return (
      Math.abs(projected.x) <= margin &&
      Math.abs(projected.y) <= margin &&
      projected.z > -1 &&
      projected.z < 1
    );
  });
}

function fitRadius(
  target: Vec3,
  phi: number,
  theta: number,
  fov: number,
  aspect: number,
  points: readonly Vec3[] = sceneCorners(),
): number {
  let near = MIN_DISTANCE;
  let far = MAX_DISTANCE;
  for (let step = 0; step < FIT_STEPS; step++) {
    const radius = (near + far) / 2;
    if (fitsInView({ target, radius, phi, theta }, fov, aspect, points)) far = radius;
    else near = radius;
  }
  return far;
}

export function presetPose(view: CameraView, fov: number, aspect: number): Pose {
  const target = sceneCentre();
  const { phi, theta } = VIEW_ANGLES[view];
  return { target, phi, theta, radius: fitRadius(target, phi, theta, fov, aspect) };
}

interface WheelInput {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
}

function isMacNotch(deltaY: number): boolean {
  return deltaY !== 0 && deltaY % MAC_NOTCH_PIXELS === 0;
}

function isMouseNotch(deltaY: number): boolean {
  return (
    isMacNotch(deltaY) || (Number.isInteger(deltaY) && Math.abs(deltaY) >= MIN_WHOLE_PIXEL_NOTCH)
  );
}

function wheelPixels({ deltaY, deltaMode }: WheelInput): number {
  if (deltaMode === 0 && isMacNotch(deltaY)) return (deltaY / MAC_NOTCH_PIXELS) * NOTCH_PIXELS;
  return deltaY * (PIXELS_PER_DELTA_UNIT[deltaMode] ?? 1);
}

export function wheelZoomFactor(input: WheelInput): number {
  const { deltaY, deltaMode, ctrlKey } = input;
  if (ctrlKey && deltaMode === 0 && !isMouseNotch(deltaY)) {
    return Math.exp(deltaY * PINCH_ZOOM_PER_PIXEL);
  }
  const step = wheelPixels(input) * WHEEL_ZOOM_PER_PIXEL;
  return Math.exp(MathUtils.clamp(step, -MAX_WHEEL_STEP, MAX_WHEEL_STEP));
}

function clampToRoom(point: Point): Point {
  return {
    x: MathUtils.clamp(point.x, ROOM_BOUNDS.min.x, ROOM_BOUNDS.max.x),
    z: MathUtils.clamp(point.z, ROOM_BOUNDS.min.z, ROOM_BOUNDS.max.z),
  };
}

function moveToward(from: Point, to: Point, fraction: number): Vec3 {
  return { x: from.x + (to.x - from.x) * fraction, y: 0, z: from.z + (to.z - from.z) * fraction };
}

export function zoomPose(current: Pose, factor: number, cursor: Point | null): Pose {
  const radius = MathUtils.clamp(current.radius * factor, MIN_DISTANCE, MAX_DISTANCE);
  const { target } = current;
  if (radius < current.radius) {
    const anchor = cursor ? clampToRoom(cursor) : target;
    return { ...current, radius, target: moveToward(target, anchor, 1 - radius / current.radius) };
  }
  const centre = sceneCentre();
  const offset = Math.hypot(centre.x - target.x, centre.z - target.z);
  const recentre = (radius - current.radius) * RECENTRE_PER_METRE;
  return {
    ...current,
    radius,
    target: offset > recentre ? moveToward(target, centre, recentre / offset) : centre,
  };
}

export function focusPose(current: Pose, item: Point): Pose {
  return {
    ...current,
    target: { x: item.x, y: 0, z: item.z },
    radius: Math.min(current.radius, FOCUS_RADIUS),
  };
}

type LookAtArgs = readonly [
  positionX: number,
  positionY: number,
  positionZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
];

export function lookAtArgs(pose: Pose): LookAtArgs {
  const position = cameraPosition(pose);
  return [position.x, position.y, position.z, pose.target.x, pose.target.y, pose.target.z];
}
