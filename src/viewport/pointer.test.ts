import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOG } from '../domain/catalog';
import type { ItemId, PlacedItem } from '../domain/types';
import { cancelDrag, moveItem, select, startPlacement } from '../state/actions';
import { resetEditor, useEditor } from '../state/store';
import { makeItem } from '../test/fixtures';
import { setCursorPoint, useCursor } from './cursorStore';
import { attachPointerInteraction } from './pointer';

const WIDTH = 800;
const HEIGHT = 600;

interface ScreenPoint {
  readonly clientX: number;
  readonly clientY: number;
}

const drive = makeItem({ kind: 'drive', tag: 'VFD-01', x: 5.25, z: 3.25 });
const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 14, z: 8.25 });

function createHarness() {
  const element = document.createElement('div');
  const captured = new Set<number>();
  element.setPointerCapture = (pointerId) => {
    captured.add(pointerId);
  };
  element.releasePointerCapture = (pointerId) => {
    captured.delete(pointerId);
  };
  element.hasPointerCapture = (pointerId) => captured.has(pointerId);
  element.getBoundingClientRect = () => new DOMRect(0, 0, WIDTH, HEIGHT);

  const camera = new PerspectiveCamera(40, WIDTH / HEIGHT, 0.1, 500);
  camera.position.set(10, 30, 6.001);
  camera.lookAt(10, 0, 6);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const controls = { enabled: true };
  const detach = attachPointerInteraction({ element, camera, controls: () => controls });

  const screen = (x: number, z: number, y = 0): ScreenPoint => {
    const projected = new Vector3(x, y, z).project(camera);
    return {
      clientX: ((projected.x + 1) / 2) * WIDTH,
      clientY: ((1 - projected.y) / 2) * HEIGHT,
    };
  };

  const fire = (type: string, at: ScreenPoint, init: PointerEventInit = {}) => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
        ...at,
        ...init,
      }),
    );
  };

  const nudge = (at: ScreenPoint, dx: number, dy = 0): ScreenPoint => ({
    clientX: at.clientX + dx,
    clientY: at.clientY + dy,
  });

  return { element, controls, captured, detach, screen, fire, nudge };
}

let harness: ReturnType<typeof createHarness>;

function itemNamed(tag: string): PlacedItem | undefined {
  return useEditor.getState().items.find((item) => item.tag === tag);
}

beforeEach(() => {
  resetEditor([drive, cabinet]);
  setCursorPoint(null);
  harness = createHarness();
});

afterEach(() => {
  harness.detach();
  document.body.replaceChildren();
});

describe('pointer interaction: selecting', () => {
  it('selects the item under a click and announces it', () => {
    const top = harness.screen(drive.x, drive.z, CATALOG.drive.height);
    harness.fire('pointerdown', top);
    harness.fire('pointerup', top);
    const state = useEditor.getState();
    expect(state.selectedId).toBe(drive.id);
    expect(state.announcement?.text).toContain('VFD-01');
    expect(state.history.past).toHaveLength(0);
    expect(harness.controls.enabled).toBe(true);
  });

  it('clears the selection when empty floor is clicked', () => {
    select(drive.id);
    const floor = harness.screen(10, 10);
    harness.fire('pointerdown', floor);
    harness.fire('pointerup', floor);
    expect(useEditor.getState().selectedId).toBeNull();
    expect(useEditor.getState().announcement?.text).toBe('Selection cleared.');
  });

  it('never selects or deselects while orbiting from the floor', () => {
    select(cabinet.id);
    const floor = harness.screen(10, 10);
    harness.fire('pointerdown', floor);
    harness.fire('pointermove', harness.nudge(floor, 30, 12));
    harness.fire('pointerup', harness.nudge(floor, 30, 12));
    expect(useEditor.getState().selectedId).toBe(cabinet.id);
    expect(harness.controls.enabled).toBe(true);
  });

  it('keeps the floor press until release, even when an orbit ends outside the canvas', () => {
    select(cabinet.id);
    const floor = harness.screen(10, 10);
    harness.fire('pointerdown', floor);
    expect(harness.captured.has(1)).toBe(true);
    harness.fire('pointermove', harness.nudge(floor, 900, 700));
    harness.fire('pointerup', harness.nudge(floor, 900, 700));
    expect(harness.captured.size).toBe(0);
    const top = harness.screen(drive.x, drive.z, CATALOG.drive.height);
    harness.fire('pointerdown', top);
    harness.fire('pointerup', top);
    expect(useEditor.getState().selectedId).toBe(drive.id);
  });

  it('leaves selection to the camera for right-button presses', () => {
    const top = harness.screen(drive.x, drive.z, CATALOG.drive.height);
    harness.fire('pointerdown', top, { button: 2, buttons: 2 });
    harness.fire('pointerup', top, { button: 2 });
    expect(useEditor.getState().selectedId).toBeNull();
  });

  const focusField = () => {
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const selectedAtBlur: (ItemId | null)[] = [];
    field.addEventListener('blur', () => {
      selectedAtBlur.push(useEditor.getState().selectedId);
    });
    return selectedAtBlur;
  };

  it('blurs the focused field before picking another item, so the field commits first', () => {
    select(cabinet.id);
    const selectedAtBlur = focusField();
    harness.fire('pointerdown', harness.screen(drive.x, drive.z, CATALOG.drive.height));
    expect(selectedAtBlur).toEqual([cabinet.id]);
    expect(useEditor.getState().selectedId).toBe(drive.id);
  });

  it('blurs the focused field before a tap on empty floor clears the selection', () => {
    select(cabinet.id);
    const selectedAtBlur = focusField();
    const floor = harness.screen(10, 10);
    harness.fire('pointerdown', floor, { pointerType: 'touch' });
    harness.fire('pointerup', floor, { pointerType: 'touch' });
    expect(selectedAtBlur).toEqual([cabinet.id]);
    expect(useEditor.getState().selectedId).toBeNull();
  });

  it('keeps focus on the 3D view when it already has it', () => {
    const view = document.createElement('div');
    view.tabIndex = 0;
    view.append(harness.element);
    document.body.append(view);
    view.focus();
    const top = harness.screen(drive.x, drive.z, CATALOG.drive.height);
    harness.fire('pointerdown', top);
    expect(useEditor.getState().selectedId).toBe(drive.id);
    expect(document.activeElement).toBe(view);
  });

  it('clears text left selected elsewhere on the page, as a click on the page would', () => {
    const note = document.createElement('p');
    note.textContent = 'TR-01 and UPS-01 are 0.50 m apart';
    document.body.append(note);
    document.getSelection()?.selectAllChildren(note);
    harness.fire('pointerdown', harness.screen(drive.x, drive.z, CATALOG.drive.height));
    expect(document.getSelection()?.toString()).toBe('');
    expect(useEditor.getState().selectedId).toBe(drive.id);
  });
});

describe('pointer interaction: dragging', () => {
  it('moves an item cell by cell and commits a single undo step on release', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    expect(harness.controls.enabled).toBe(false);
    expect(harness.captured.has(1)).toBe(true);

    harness.fire('pointermove', harness.screen(6.25, 3.25));
    expect(useEditor.getState().drag).toMatchObject({ id: drive.id, x: 6.25, z: 3.25 });
    harness.fire('pointermove', harness.screen(7.25, 4.25));
    expect(useEditor.getState().drag).toMatchObject({ x: 7.25, z: 4.25 });
    expect(itemNamed('VFD-01')).toMatchObject({ x: 5.25, z: 3.25 });

    harness.fire('pointerup', harness.screen(7.25, 4.25));
    const state = useEditor.getState();
    expect(state.drag).toBeNull();
    expect(itemNamed('VFD-01')).toMatchObject({ x: 7.25, z: 4.25 });
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0]?.label).toEqual({ action: 'move', subject: 'VFD-01' });
    expect(state.selectedId).toBe(drive.id);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.captured.size).toBe(0);
  });

  it('snaps to the grid and keeps the item inside the room', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    harness.fire('pointermove', harness.screen(-3, 5.4));
    harness.fire('pointerup', harness.screen(-3, 5.4));
    expect(itemNamed('VFD-01')).toMatchObject({ x: 0.25, z: 5.25 });
  });

  it('treats a wobble under 4 px as a click, not a drag', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    harness.fire('pointermove', harness.nudge(start, 3));
    expect(useEditor.getState().drag).toBeNull();
    harness.fire('pointerup', harness.nudge(start, 3));
    expect(useEditor.getState().history.past).toHaveLength(0);
    expect(useEditor.getState().selectedId).toBe(drive.id);
  });

  it('tolerates the keyboard cancelling the drag mid-gesture', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    harness.fire('pointermove', harness.screen(8.25, 6.25));
    expect(useEditor.getState().drag).not.toBeNull();
    cancelDrag();
    harness.fire('pointermove', harness.screen(9.25, 6.25));
    harness.fire('pointerup', harness.screen(9.25, 6.25));
    expect(useEditor.getState().history.past).toHaveLength(0);
    expect(itemNamed('VFD-01')).toMatchObject({ x: 5.25, z: 3.25 });
    expect(harness.controls.enabled).toBe(true);
  });

  it('drops the preview when the browser cancels the pointer', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    harness.fire('pointermove', harness.screen(8.25, 6.25));
    harness.fire('pointercancel', harness.screen(8.25, 6.25));
    expect(useEditor.getState().drag).toBeNull();
    expect(useEditor.getState().history.past).toHaveLength(0);
    expect(harness.controls.enabled).toBe(true);
  });

  it('drops the preview when the pointer capture is lost without a release', () => {
    const start = harness.screen(drive.x, drive.z);
    harness.fire('pointerdown', start);
    harness.fire('pointermove', harness.screen(8.25, 6.25));
    harness.fire('lostpointercapture', harness.screen(8.25, 6.25));
    expect(useEditor.getState().drag).toBeNull();
    expect(harness.controls.enabled).toBe(true);

    const elsewhere = harness.screen(12.25, 8.25);
    harness.fire('pointermove', elsewhere, { buttons: 0 });
    harness.fire('pointerdown', elsewhere);
    harness.fire('pointerup', elsewhere);
    expect(itemNamed('VFD-01')).toMatchObject({ x: 5.25, z: 3.25 });
    expect(useEditor.getState().history.past).toHaveLength(0);
  });

  it('keeps the browser menu closed on a right-click while an item is pressed', () => {
    harness.fire('pointerdown', harness.screen(drive.x, drive.z));
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    harness.element.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

describe('pointer interaction: touch', () => {
  const pinchWithStillFirstFinger = () => {
    const first = harness.screen(12, 8);
    const second = harness.nudge(first, 40);
    const spread = harness.nudge(second, 200);
    const firstFinger = { pointerType: 'touch' };
    const secondFinger = { pointerType: 'touch', pointerId: 2, isPrimary: false };
    harness.fire('pointerdown', first, firstFinger);
    harness.fire('pointerdown', second, secondFinger);
    harness.fire('pointermove', spread, secondFinger);
    harness.fire('pointerup', spread, secondFinger);
    harness.fire('pointerup', first, firstFinger);
  };

  it('keeps the selection through a pinch whose first finger stays still', () => {
    select(drive.id);
    pinchWithStillFirstFinger();
    expect(useEditor.getState().selectedId).toBe(drive.id);
  });

  it('places nothing during a pinch whose first finger stays still', () => {
    startPlacement('cabinet');
    pinchWithStillFirstFinger();
    expect(useEditor.getState().items).toHaveLength(2);
    expect(useEditor.getState().tool.type).toBe('place');
  });

  it('blurs the focused field when the selected item is pressed, then drags the item from where it was pressed', () => {
    select(drive.id);
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    field.addEventListener('blur', () => {
      moveItem(drive.id, { x: 9.25, z: drive.z });
    });
    const finger = { pointerType: 'touch' };
    const target = harness.screen(7.25, 4.25);
    harness.fire('pointerdown', harness.screen(drive.x, drive.z), finger);
    expect(itemNamed('VFD-01')).toMatchObject({ x: 9.25, z: 3.25 });
    harness.fire('pointermove', target, finger);
    harness.fire('pointerup', target, finger);
    const floor = harness.screen(10, 10);
    harness.fire('pointerdown', floor, finger);
    harness.fire('pointerup', floor, finger);
    expect(itemNamed('VFD-01')).toMatchObject({ x: 7.25, z: 4.25 });
  });
});

describe('pointer interaction: placing', () => {
  it('moves the ghost with the pointer and places the item on click', () => {
    startPlacement('ups');
    const spot = harness.screen(12, 3);
    harness.fire('pointermove', spot, { buttons: 0 });
    expect(useEditor.getState().ghost).toEqual({ x: 12, z: 3 });
    harness.fire('pointerdown', spot);
    harness.fire('pointerup', spot);
    const state = useEditor.getState();
    expect(itemNamed('UPS-01')).toMatchObject({ kind: 'ups', x: 12, z: 3 });
    expect(state.tool).toEqual({ type: 'select' });
    expect(state.history.past).toHaveLength(1);
  });

  it('keeps placing after a Shift+click', () => {
    startPlacement('drive');
    const spot = harness.screen(16.25, 2.25);
    harness.fire('pointerdown', spot);
    harness.fire('pointerup', spot, { shiftKey: true });
    expect(itemNamed('VFD-02')).toMatchObject({ x: 16.25, z: 2.25 });
    expect(useEditor.getState().tool.type).toBe('place');
  });

  it('places nothing when the press turns into an orbit', () => {
    startPlacement('drive');
    const spot = harness.screen(16.25, 2.25);
    harness.fire('pointerdown', spot);
    harness.fire('pointermove', harness.nudge(spot, 40));
    harness.fire('pointerup', harness.nudge(spot, 40));
    expect(useEditor.getState().items).toHaveLength(2);
  });
});

describe('pointer interaction: hover and cursor', () => {
  it('highlights the item under the pointer and shows a grab cursor', () => {
    harness.fire('pointermove', harness.screen(cabinet.x, cabinet.z, 1), { buttons: 0 });
    expect(useEditor.getState().hoveredId).toBe(cabinet.id);
    expect(harness.element.style.cursor).toBe('grab');
    harness.fire('pointermove', harness.screen(10, 10), { buttons: 0 });
    expect(useEditor.getState().hoveredId).toBeNull();
    expect(harness.element.style.cursor).toBe('');
  });

  it('reports the snapped floor point and clears it when the pointer leaves', () => {
    harness.fire('pointermove', harness.screen(3.3, 2.1), { buttons: 0 });
    expect(useCursor.getState().point).toEqual({ x: 3.5, z: 2 });
    harness.element.dispatchEvent(new PointerEvent('pointerleave'));
    expect(useCursor.getState().point).toBeNull();
    expect(useEditor.getState().hoveredId).toBeNull();
  });

  it('stops listening once detached', () => {
    harness.detach();
    const top = harness.screen(drive.x, drive.z, CATALOG.drive.height);
    harness.fire('pointerdown', top);
    harness.fire('pointerup', top);
    expect(useEditor.getState().selectedId).toBeNull();
  });
});
