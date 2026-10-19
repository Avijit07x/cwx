import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Point } from '../domain/types';
import {
  cameraPosition,
  FOCUS_RADIUS,
  fitsInView,
  focusPose,
  lookAtArgs,
  MAX_DISTANCE,
  MIN_DISTANCE,
  presetPose,
  ROOM_BOUNDS,
  sceneCentre,
  sceneCorners,
  wheelZoomFactor,
  zoomPose,
  type Pose,
} from './camera';

const FOV = 40;
const WIDE = 1.7;

function screenPositionOf(point: Point, pose: Pose): readonly [number, number] {
  const camera = new PerspectiveCamera(FOV, WIDE, 0.1, 1000);
  const position = cameraPosition(pose);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateMatrixWorld();
  const projected = new Vector3(point.x, 0, point.z).project(camera);
  return [projected.x, projected.y];
}

function isInsideRoom({ x, z }: Point): boolean {
  return x >= 0 && x <= 20 && z >= 0 && z <= 12;
}

describe('presetPose', () => {
  it.each(['perspective', 'top'] as const)('%s view fits the whole room snugly', (view) => {
    const pose = presetPose(view, FOV, WIDE);
    expect(fitsInView(pose, FOV, WIDE, sceneCorners())).toBe(true);
    expect(fitsInView({ ...pose, radius: pose.radius * 0.95 }, FOV, WIDE, sceneCorners())).toBe(
      false,
    );
  });

  it('looks straight down at the room with north at the top', () => {
    const pose = presetPose('top', FOV, WIDE);
    const position = cameraPosition(pose);
    expect(position.x).toBeCloseTo(pose.target.x, 2);
    expect(position.z).toBeCloseTo(pose.target.z, 2);
    expect(position.z).toBeGreaterThanOrEqual(pose.target.z);
    expect(position.y).toBeCloseTo(pose.radius, 2);
  });

  it('looks at the fronts from the south-east in the 3D view', () => {
    const pose = presetPose('perspective', FOV, WIDE);
    const position = cameraPosition(pose);
    expect(position.z).toBeGreaterThan(pose.target.z);
    expect(position.x).toBeGreaterThan(pose.target.x);
    expect(position.y).toBeGreaterThan(0);
  });

  it('steps back for a narrow viewport', () => {
    expect(presetPose('top', FOV, 0.8).radius).toBeGreaterThan(presetPose('top', FOV, 2).radius);
  });
});

describe('focusPose', () => {
  const current: Pose = { target: { x: 10, y: 0, z: 5 }, radius: 30, phi: 0.9, theta: 0.4 };

  it('centres the item without changing the viewing angle and comes closer', () => {
    const pose = focusPose(current, { x: 3.25, z: 8.5 });
    expect(pose.target).toEqual({ x: 3.25, y: 0, z: 8.5 });
    expect(pose.phi).toBe(current.phi);
    expect(pose.theta).toBe(current.theta);
    expect(pose.radius).toBe(FOCUS_RADIUS);
  });

  it('never moves further away than the current view', () => {
    expect(focusPose({ ...current, radius: 6 }, { x: 1, z: 1 }).radius).toBe(6);
  });
});

describe('lookAtArgs', () => {
  it('places the camera on the pose and aims it at the pose target', () => {
    const pose = presetPose('top', FOV, WIDE);
    const [px, py, pz, tx, ty, tz] = lookAtArgs(pose);
    const position = cameraPosition(pose);
    expect([px, py, pz]).toEqual([position.x, position.y, position.z]);
    expect([tx, ty, tz]).toEqual([pose.target.x, pose.target.y, pose.target.z]);
    expect(py).toBeCloseTo(pose.radius, 2);
  });
});

describe('wheelZoomFactor', () => {
  const wheel = (deltaY: number, deltaMode = 0) =>
    wheelZoomFactor({ deltaY, deltaMode, ctrlKey: false });
  const pinch = (deltaY: number) => wheelZoomFactor({ deltaY, deltaMode: 0, ctrlKey: true });

  it('moves about a fifth of the distance per mouse wheel notch, in and out', () => {
    expect(wheel(-100)).toBeCloseTo(0.82, 2);
    expect(wheel(100)).toBeCloseTo(1.22, 2);
    expect(wheel(-100) * wheel(100)).toBeCloseTo(1, 10);
  });

  it('follows a trackpad pinch exactly, since Chrome reports a pinch as -100 ln(scale)', () => {
    const steps = Array.from({ length: 10 }, () => pinch((-100 * Math.log(2)) / 10));
    expect(steps.reduce((product, step) => product * step, 1)).toBeCloseTo(0.5, 10);
  });

  it('applies a pinch in full when slow frames merge it into a few large events', () => {
    expect(pinch(-42.6)).toBeCloseTo(Math.exp(-0.426), 10);
    const merged = [-3.2, -3.2, -42.6, -100 * Math.log(2) + 49];
    expect(merged.reduce((product, delta) => product * pinch(delta), 1)).toBeCloseTo(0.5, 10);
  });

  it('treats line and page deltas like a notch and caps any single wheel event at 25 %', () => {
    expect(wheel(3, 1)).toBeCloseTo(1.25, 10);
    expect(wheel(-1, 2)).toBeCloseTo(0.8, 10);
    expect(wheel(5000)).toBeCloseTo(1.25, 10);
  });

  it('gives a Ctrl + mouse-wheel notch the wheel step instead of the pinch gain', () => {
    expect(pinch(100)).toBeCloseTo(wheel(100), 10);
    expect(pinch(-120)).toBeCloseTo(wheel(-120), 10);
  });

  it('zooms a macOS mouse-wheel notch (4.000244140625 px) like a 100 px notch', () => {
    expect(wheel(-4.000244140625)).toBeCloseTo(wheel(-100), 10);
    expect(wheel(12.000732421875)).toBeCloseTo(1.25, 10);
    expect(pinch(4.000244140625)).toBeCloseTo(wheel(100), 10);
    expect(wheel(4)).toBeCloseTo(Math.exp(0.008), 10);
  });

  it('leaves the distance alone for a sideways scroll', () => {
    expect(wheel(0)).toBe(1);
  });
});

describe('zoomPose', () => {
  const overview = presetPose('perspective', FOV, WIDE);
  const corner: Point = { x: 2, z: 10.5 };

  it('keeps the floor point under the cursor in place while zooming in', () => {
    const zoomed = zoomPose(overview, 0.6, corner);
    expect(zoomed.radius).toBeCloseTo(overview.radius * 0.6, 10);
    const [beforeX, beforeY] = screenPositionOf(corner, overview);
    const [afterX, afterY] = screenPositionOf(corner, zoomed);
    expect(afterX).toBeCloseTo(beforeX, 6);
    expect(afterY).toBeCloseTo(beforeY, 6);
    expect(zoomed.phi).toBe(overview.phi);
    expect(zoomed.theta).toBe(overview.theta);
  });

  it('zooms toward the middle of the view when the cursor is off the floor', () => {
    expect(zoomPose(overview, 0.5, null).target).toEqual(overview.target);
  });

  it('never lets the cursor pull the view off the room', () => {
    let pose = overview;
    for (let step = 0; step < 40; step++) pose = zoomPose(pose, 0.8, { x: 60, z: -40 });
    expect(pose.radius).toBe(MIN_DISTANCE);
    expect(isInsideRoom(pose.target)).toBe(true);
    expect(pose.target.x).toBeGreaterThan(overview.target.x);
    expect(pose.target.z).toBeLessThan(overview.target.z);
  });

  it('stops at the distance limits without moving the view', () => {
    const close = { ...overview, radius: MIN_DISTANCE };
    expect(zoomPose(close, 0.5, corner)).toEqual(close);
    const far = { ...overview, target: { x: 3, y: 0, z: 9 }, radius: MAX_DISTANCE };
    expect(zoomPose(far, 2, corner)).toEqual(far);
  });

  it('slides back toward the room centre while zooming out, half a metre per metre at most', () => {
    const near = { ...overview, target: { x: 2, y: 0, z: 10.5 }, radius: 6 };
    const out = zoomPose(near, 1.25, corner);
    const travelled = Math.hypot(out.target.x - 2, out.target.z - 10.5);
    expect(travelled).toBeCloseTo((out.radius - near.radius) / 2, 10);
    const centre = sceneCentre();
    expect(Math.hypot(out.target.x - centre.x, out.target.z - centre.z)).toBeLessThan(
      Math.hypot(2 - centre.x, 10.5 - centre.z),
    );
  });

  it('returns to the whole-room view after zooming into a corner and back out', () => {
    let pose = overview;
    for (let step = 0; step < 12; step++) pose = zoomPose(pose, 0.82, corner);
    expect(pose.radius).toBe(MIN_DISTANCE);
    for (let step = 0; step < 12; step++) pose = zoomPose(pose, 1 / 0.82, corner);
    expect(pose.target).toEqual(sceneCentre());
    expect(fitsInView(pose, FOV, WIDE, sceneCorners())).toBe(true);
  });
});

describe('ROOM_BOUNDS', () => {
  it('keeps the orbit target on the room floor', () => {
    const clamp = (x: number, y: number, z: number) =>
      ROOM_BOUNDS.clampPoint(new Vector3(x, y, z), new Vector3()).toArray();
    expect(clamp(-3, 4, 14)).toEqual([0, 0, 12]);
    expect(clamp(7.5, 0, 3)).toEqual([7.5, 0, 3]);
    expect(clamp(25, -1, -1)).toEqual([20, 0, 0]);
  });
});
