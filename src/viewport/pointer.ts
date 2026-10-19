import { Raycaster, type Camera, type Ray } from 'three';
import type { ItemId, Point } from '../domain/types';
import {
  beginDrag,
  cancelDrag,
  endDrag,
  hover,
  placeAtGhost,
  select,
  setGhost,
  updateDrag,
} from '../state/actions';
import { selectEffectiveIndex, selectEffectiveItems } from '../state/selectors';
import { useEditor } from '../state/store';
import { setCursorPoint } from './cursorStore';
import {
  exceedsDragThreshold,
  intersectFloor,
  pickItem,
  rayFromPointer,
  snapCursor,
} from './interaction';

interface ToggleableControls {
  enabled: boolean;
}

interface PointerInteractionOptions {
  readonly element: HTMLElement;
  readonly camera: Camera;
  readonly controls: () => ToggleableControls | null;
}

interface PressStart {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
}

type Press =
  | (PressStart & {
      readonly type: 'item';
      readonly id: ItemId;
      readonly offset: Point;
      readonly dragging: boolean;
    })
  | (PressStart & { readonly type: 'floor'; readonly moved: boolean });

const PRIMARY_BUTTON = 0;

export function attachPointerInteraction({
  element,
  camera,
  controls,
}: PointerInteractionOptions): () => void {
  const raycaster = new Raycaster();
  let press: Press | null = null;

  const rayFor = (event: PointerEvent): Ray => rayFromPointer(raycaster, event, element, camera);

  const setControlsEnabled = (enabled: boolean) => {
    const current = controls();
    if (current) current.enabled = enabled;
  };

  const hoverAt = (event: PointerEvent) => {
    const state = useEditor.getState();
    const ray = rayFor(event);
    const floor = intersectFloor(ray);
    setCursorPoint(snapCursor(floor));
    if (state.tool.type === 'place') {
      if (floor) setGhost(floor);
      element.style.cursor = 'crosshair';
      return;
    }
    const hit = pickItem(ray, selectEffectiveItems(state));
    hover(hit?.id ?? null);
    element.style.cursor = hit ? 'grab' : '';
  };

  const releaseCapture = (pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  };

  const releaseItemPress = (pointerId: number) => {
    releaseCapture(pointerId);
    setControlsEnabled(true);
  };

  const commitFocusedField = () => {
    const focused = element.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && !focused.contains(element)) focused.blur();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (press?.type === 'floor') press = { ...press, moved: true };
    if (!event.isPrimary || event.button !== PRIMARY_BUTTON || press) return;
    element.ownerDocument.getSelection()?.removeAllRanges();
    const start = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    const state = useEditor.getState();
    const ray = rayFor(event);
    const hit = state.tool.type === 'select' ? pickItem(ray, selectEffectiveItems(state)) : null;
    const item = hit ? selectEffectiveIndex(state).get(hit.id) : undefined;
    commitFocusedField();
    if (!item) {
      press = { ...start, type: 'floor', moved: false };
      element.setPointerCapture(event.pointerId);
      return;
    }
    const grab = intersectFloor(ray) ?? item;
    press = {
      ...start,
      type: 'item',
      id: item.id,
      offset: { x: item.x - grab.x, z: item.z - grab.z },
      dragging: false,
    };
    setControlsEnabled(false);
    element.setPointerCapture(event.pointerId);
    element.style.cursor = 'grabbing';
    if (state.selectedId !== item.id) select(item.id, { announce: true });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!press) {
      if (event.buttons === 0) hoverAt(event);
      return;
    }
    if (event.pointerId !== press.pointerId) return;
    const beyond = exceedsDragThreshold(event.clientX - press.startX, event.clientY - press.startY);
    if (press.type === 'floor') {
      if (beyond && !press.moved) press = { ...press, moved: true };
      return;
    }
    if (!press.dragging) {
      if (!beyond) return;
      beginDrag(press.id);
      press = { ...press, dragging: true };
    }
    const floor = intersectFloor(rayFor(event));
    if (!floor) return;
    setCursorPoint(snapCursor(floor));
    updateDrag({ x: floor.x + press.offset.x, z: floor.z + press.offset.z });
  };

  const clickFloor = (event: PointerEvent) => {
    const state = useEditor.getState();
    if (state.tool.type === 'place') {
      const floor = intersectFloor(rayFor(event));
      if (floor) setGhost(floor);
      placeAtGhost({ keepPlacing: event.shiftKey });
      return;
    }
    if (state.selectedId !== null) select(null, { announce: true });
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const finished = press;
    press = null;
    if (finished.type === 'floor') {
      releaseCapture(event.pointerId);
      if (!finished.moved) clickFloor(event);
      return;
    }
    if (finished.dragging) endDrag();
    releaseItemPress(event.pointerId);
    hoverAt(event);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const cancelled = press;
    press = null;
    if (cancelled.type !== 'item') {
      releaseCapture(event.pointerId);
      return;
    }
    if (cancelled.dragging) cancelDrag();
    releaseItemPress(event.pointerId);
  };

  const onPointerLeave = () => {
    if (press) return;
    hover(null);
    setCursorPoint(null);
    element.style.cursor = '';
  };

  const onContextMenu = (event: MouseEvent) => {
    if (press) event.preventDefault();
  };

  element.addEventListener('pointerdown', onPointerDown, { capture: true });
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('lostpointercapture', onPointerCancel);
  element.addEventListener('pointerleave', onPointerLeave);
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown, { capture: true });
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('lostpointercapture', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerLeave);
    element.removeEventListener('contextmenu', onContextMenu);
    if (press?.type === 'item') {
      if (press.dragging) cancelDrag();
      releaseItemPress(press.pointerId);
    } else if (press) {
      releaseCapture(press.pointerId);
    }
    press = null;
    element.style.cursor = '';
  };
}
