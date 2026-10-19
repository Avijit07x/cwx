import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginDrag,
  removeItem,
  select,
  setGhost,
  setLocale,
  startPlacement,
  updateDrag,
} from '../state/actions';
import { resetEditor, useEditor } from '../state/store';
import { makeItem } from '../test/fixtures';
import { Legend } from './Legend';
import { publishPerf, type PerfSample } from './perf';
import { PerfHud } from './PerfHud';
import { StatusBanner } from './StatusBanner';
import Viewport from './Viewport';
import { ViewportControls } from './ViewportControls';

const first = makeItem({ kind: 'drive', tag: 'VFD-01', x: 2.25, z: 2.25 });
const second = makeItem({ kind: 'drive', tag: 'VFD-02', x: 4.25, z: 2.25 });
const SINGLE_KEY = /(?<![\p{L}\p{N}])(?:R|F|\[|\]|\+|−|\?)(?![\p{L}\p{N}])/u;

beforeEach(() => {
  resetEditor([first, second]);
});

describe('Viewport without WebGL', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('explains that the 3D view is unavailable and that editing still works', () => {
    render(<Viewport singleKeys />);
    expect(screen.getByText('3D view unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        'WebGL is turned off on this device; editing still works in the list and properties panel.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View controls' })).not.toBeInTheDocument();
  });

  it('keeps a focusable, described group for keyboard users', () => {
    render(<Viewport singleKeys />);
    const group = screen.getByRole('group', { name: '3D layout view' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAttribute('aria-roledescription', '3D viewport');
    expect(group).toHaveAccessibleDescription(/arrow keys to move the selected item/);
  });

  it('names no single-key shortcut in the description once they are switched off', () => {
    const { rerender } = render(<Viewport singleKeys />);
    const group = screen.getByRole('group', { name: '3D layout view' });
    expect(group).toHaveAccessibleDescription(SINGLE_KEY);
    rerender(<Viewport singleKeys={false} />);
    expect(group).toHaveAccessibleDescription(/arrow keys to move the selected item/);
    expect(group).not.toHaveAccessibleDescription(SINGLE_KEY);
  });

  it('leaves Ctrl + wheel and pinch gestures to the browser, so the page can still zoom', () => {
    render(<Viewport singleKeys />);
    const group = screen.getByRole('group', { name: '3D layout view' });
    expect(fireEvent.wheel(group, { ctrlKey: true, deltaY: -40 })).toBe(true);
    expect(fireEvent(group, new Event('gesturestart', { cancelable: true }))).toBe(true);
    expect(fireEvent(group, new Event('gesturechange', { cancelable: true }))).toBe(true);
  });

  it('keeps the layout editable and follows the language while the 3D view is off', () => {
    render(<Viewport singleKeys />);
    act(() => {
      removeItem(first.id);
      setLocale('vi');
    });
    expect(useEditor.getState().items).toEqual([second]);
    expect(screen.getByText('Không thể hiển thị chế độ xem 3D')).toBeInTheDocument();
  });
});

describe('ViewportControls', () => {
  it('requests the top and 3D camera presets', () => {
    render(<ViewportControls free={false} singleKeys />);
    expect(screen.getByRole('radio', { name: '3D' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Top' }));
    expect(useEditor.getState().camera).toMatchObject({ view: 'top', seq: 1, focusId: null });
  });

  it('lets a preset be applied again after the camera was moved by hand', () => {
    render(<ViewportControls free singleKeys />);
    expect(screen.getByRole('radio', { name: '3D' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Top' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    expect(useEditor.getState().camera).toMatchObject({ view: 'perspective', seq: 1 });
  });

  it('focuses the camera on the selection only when there is one', () => {
    render(<ViewportControls free={false} singleKeys />);
    const focus = screen.getByRole('button', { name: 'Focus selection' });
    expect(focus).toBeDisabled();
    expect(focus).toHaveAttribute('aria-keyshortcuts', 'F');
    act(() => {
      select(second.id);
    });
    fireEvent.click(focus);
    expect(useEditor.getState().camera).toMatchObject({ focusId: second.id, seq: 1 });
  });

  it('zooms in and out with buttons, without a wheel or a pinch', () => {
    render(<ViewportControls free={false} singleKeys />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomIn).toHaveAttribute('aria-keyshortcuts', 'Plus');
    expect(zoomOut).toHaveAttribute('aria-keyshortcuts', '-');
    fireEvent.click(zoomIn);
    expect(useEditor.getState().camera).toMatchObject({ seq: 1, zoom: 'in' });
    fireEvent.click(zoomOut);
    expect(useEditor.getState().camera).toMatchObject({ seq: 2, zoom: 'out' });
  });

  it('turns the view left and right with buttons, without a drag', () => {
    render(<ViewportControls free={false} singleKeys />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn view left' }));
    expect(useEditor.getState().camera).toMatchObject({ seq: 1, turn: -1 });
    fireEvent.click(screen.getByRole('button', { name: 'Turn view right' }));
    expect(useEditor.getState().camera).toMatchObject({ seq: 2, turn: 1 });
  });

  it('stops naming single-key shortcuts on its buttons once they are switched off', () => {
    render(<ViewportControls free={false} singleKeys={false} />);
    for (const name of ['Zoom in', 'Zoom out', 'Focus selection']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-keyshortcuts');
    }
  });

  it('toggles the performance statistics', () => {
    render(<ViewportControls free={false} singleKeys />);
    const stats = screen.getByRole('button', { name: 'Performance statistics' });
    expect(stats).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(stats);
    expect(useEditor.getState().showStats).toBe(true);
    expect(stats).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('StatusBanner', () => {
  it('stays out of the way in select mode', () => {
    const { container } = render(<StatusBanner singleKeys />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows how to place, rotate and cancel while placing', () => {
    render(<StatusBanner singleKeys />);
    act(() => {
      startPlacement('ups');
    });
    expect(screen.getByText('Placing: UPS unit')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('to rotate')).toBeInTheDocument();
    expect(screen.getByText('+ click to keep placing')).toBeInTheDocument();
  });

  it('hides the rotate key while single-key shortcuts are off', () => {
    render(<StatusBanner singleKeys={false} />);
    act(() => {
      startPlacement('ups');
    });
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(screen.queryByText('to rotate')).not.toBeInTheDocument();
  });

  it('says in words whether the placement preview meets the clearance rule', () => {
    render(<StatusBanner singleKeys />);
    act(() => {
      startPlacement('drive');
    });
    expect(screen.getByText('Clear of other items (minimum 0.60 m)')).toBeInTheDocument();
    act(() => {
      setGhost({ x: 3.25, z: 2.25 });
    });
    expect(screen.getByText('Too close to VFD-01 and VFD-02.')).toBeInTheDocument();
    act(() => {
      setLocale('vi');
    });
    expect(screen.getByText('Quá gần VFD-01 và VFD-02.')).toBeInTheDocument();
  });

  it('names both items while a drag breaks the clearance rule', () => {
    render(<StatusBanner singleKeys />);
    act(() => {
      beginDrag(first.id);
      updateDrag({ x: 3.5, z: 2.25 });
    });
    expect(
      screen.getByText('VFD-01 and VFD-02 are 0.00 m apart (minimum 0.60 m).'),
    ).toBeInTheDocument();
  });

  it('confirms the clearance while a drag is clear of other items', () => {
    render(<StatusBanner singleKeys />);
    act(() => {
      beginDrag(first.id);
      updateDrag({ x: 8.25, z: 6.25 });
    });
    expect(screen.getByText('Clear of other items (minimum 0.60 m)')).toBeInTheDocument();
  });

  it('summarises further issues beyond the first two', () => {
    const mover = makeItem({ kind: 'drive', tag: 'VFD-01', x: 12.25, z: 9.25 });
    resetEditor([
      mover,
      makeItem({ kind: 'drive', tag: 'VFD-02', x: 5.25, z: 6.25 }),
      makeItem({ kind: 'drive', tag: 'VFD-03', x: 7.25, z: 6.25 }),
      makeItem({ kind: 'drive', tag: 'VFD-04', x: 6.25, z: 5.25 }),
      makeItem({ kind: 'drive', tag: 'VFD-05', x: 6.25, z: 7.25 }),
    ]);
    render(<StatusBanner singleKeys />);
    act(() => {
      beginDrag(mover.id);
      updateDrag({ x: 6.25, z: 6.25 });
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('and 2 more clearance issues')).toBeInTheDocument();
  });
});

describe('Legend', () => {
  it('explains every mark drawn in the scene', () => {
    render(<Legend />);
    expect(screen.getByRole('region', { name: 'Legend' })).toHaveTextContent(
      'SelectedClearance issuePlacement previewPreview too closeAssistant proposal',
    );
  });
});

describe('PerfHud', () => {
  const sample: PerfSample = {
    frames: { fps: 119.6, avgMs: 8.36, p95Ms: 9.31 },
    drawCalls: 14,
    triangles: 113178,
    geometries: 13,
    textures: 1,
    heapBytes: 85_196_800,
    gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)',
    width: 900,
    height: 463,
    dpr: 1.5,
  };

  afterEach(() => {
    publishPerf(null);
  });

  it('says it is measuring until the first sample arrives', () => {
    render(<PerfHud />);
    expect(screen.getByText('Measuring…')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it('shows the published frame, draw-call and memory numbers', () => {
    render(<PerfHud />);
    act(() => {
      publishPerf(sample);
    });
    const hud = screen.getByRole('region', { name: 'Performance' });
    expect(hud).toHaveTextContent('Frame rate (CPU)120 fps');
    expect(hud).toHaveTextContent('Frame time8.4 ms avg · 9.3 ms p95');
    expect(hud).toHaveTextContent('Draw calls14');
    expect(hud).toHaveTextContent('Triangles113,178');
    expect(hud).toHaveTextContent('Geometries13');
    expect(hud).toHaveTextContent('Textures1');
    expect(hud).toHaveTextContent('JS heap85.2 MB');
    expect(hud).toHaveTextContent('Canvas900 × 463 px · DPR 1.5');
    expect(hud).toHaveTextContent('Items2');
  });

  it('formats numbers for Vietnamese', () => {
    render(<PerfHud />);
    act(() => {
      setLocale('vi');
      publishPerf(sample);
    });
    const hud = screen.getByRole('region', { name: 'Hiệu năng' });
    expect(hud).toHaveTextContent('Tam giác113.178');
    expect(hud).toHaveTextContent('DPR 1,5');
  });
});
