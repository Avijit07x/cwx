import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BenchApp } from './BenchApp';
import type { CompletedRun, RunEvent } from './BenchViewport';
import { DEFAULT_CONFIG, type BenchConfig } from './config';
import { MissingModelError } from './loader';
import { VARIANT_FILES } from './model';

const viewport = vi.hoisted(() => {
  const state: { onEvent: ((event: RunEvent) => void) | null; crash: boolean } = {
    onEvent: null,
    crash: false,
  };
  return state;
});

const webgl = vi.hoisted(() => ({ available: true }));

vi.mock('./BenchViewport', () => ({
  BenchViewport: ({ onEvent }: { readonly onEvent: (event: RunEvent) => void }) => {
    if (viewport.crash) throw new Error('context lost');
    viewport.onEvent = onEvent;
    return <div data-testid="viewport" />;
  },
}));

vi.mock('../viewport/webgl', () => ({ isWebGLAvailable: () => webgl.available }));

const RUN: CompletedRun = {
  bytes: 5_566_536,
  loadMs: [130.2, 121, 123.4, 119.8, 125.6],
  loadMedianMs: 123.4,
  frameAvgMs: 8.333,
  frameP95Ms: 9.1,
  cpuAvgMs: 0.42,
  frames: 600,
  drawCalls: 16,
  triangles: 6_329_100,
  environment: {
    gpu: 'Test GPU',
    cssWidth: 1200,
    cssHeight: 800,
    bufferWidth: 1800,
    bufferHeight: 1200,
    pixelRatio: 1.5,
    heapBytes: 45_200_000,
    geometries: 8,
    textures: 10,
    programs: 6,
    userAgent: 'TestBrowser/1.0',
  },
};

function emit(event: RunEvent) {
  act(() => {
    viewport.onEvent?.(event);
  });
}

function renderBench(config: Partial<BenchConfig> = {}) {
  return render(<BenchApp config={{ ...DEFAULT_CONFIG, ...config }} />);
}

function resultRow(name: string) {
  return within(screen.getByRole('table', { name: 'Results' })).getByRole('row', { name });
}

beforeEach(() => {
  viewport.onEvent = null;
  viewport.crash = false;
  webgl.available = true;
  document.documentElement.lang = 'en';
  window.history.replaceState(null, '', '/bench.html');
});

describe('BenchApp', () => {
  it('shows live progress, then the measured results in a readable table', () => {
    renderBench({ copies: 100 });

    expect(screen.getByRole('status')).toHaveTextContent('Starting…');
    expect(resultRow('Draw calls per frame Pending')).toBeInTheDocument();

    emit({ type: 'progress', progress: { phase: 'load', run: 2, total: 5 } });
    expect(screen.getByRole('status')).toHaveTextContent('Load run 2 of 5');
    expect(screen.getByRole('progressbar', { name: 'Benchmark progress' })).toHaveAttribute(
      'value',
      '1',
    );

    emit({ type: 'complete', run: RUN });
    expect(screen.getByRole('status')).toHaveTextContent('Done.');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(resultRow('Draw calls per frame 16')).toBeInTheDocument();
    expect(resultRow('Triangles per frame 6,329,100')).toBeInTheDocument();
    expect(resultRow('Load time, median of 5 123.4 ms')).toBeInTheDocument();
    expect(resultRow('Frame time, 95th percentile 9.10 ms')).toBeInTheDocument();
    expect(resultRow('Frame rate, average 120.0 fps')).toBeInTheDocument();
    expect(resultRow('File size 5.57 MB (5,566,536 bytes)')).toBeInTheDocument();
    expect(resultRow('Copies 100')).toBeInTheDocument();
    expect(resultRow('GPU Test GPU')).toBeInTheDocument();
  });

  it('says the GPU is not available when the browser hides its name', () => {
    renderBench();

    emit({ type: 'complete', run: { ...RUN, environment: { ...RUN.environment, gpu: '' } } });

    expect(resultRow('Draw calls per frame 16')).toBeInTheDocument();
    expect(resultRow('GPU Not available')).toBeInTheDocument();
  });

  it('tells the reader to fetch the raw model when it is missing', () => {
    renderBench({ model: 'raw' });

    emit({ type: 'error', error: new MissingModelError(`/${VARIANT_FILES.raw}`) });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Model file not found');
    expect(status).toHaveTextContent(`/${VARIANT_FILES.raw}`);
    expect(within(status).getByText('pnpm assets:fetch').tagName).toBe('CODE');
    expect(resultRow('Draw calls per frame Not available')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('points to the optimiser when an optimised model is missing', () => {
    renderBench({ model: 'lod1' });

    emit({
      type: 'error',
      error: new MissingModelError(`/${VARIANT_FILES.lod1}`),
    });

    expect(
      within(screen.getByRole('status')).getByText('pnpm assets:optimize'),
    ).toBeInTheDocument();
  });

  it('shows the error message when a run fails', () => {
    renderBench();

    emit({ type: 'error', error: new Error('KTX2 transcoder failed to load') });

    expect(screen.getByRole('status')).toHaveTextContent('The benchmark failed');
    expect(screen.getByRole('status')).toHaveTextContent('KTX2 transcoder failed to load');
  });

  it('reports a crash of the 3D view instead of waiting forever', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    viewport.crash = true;

    renderBench();

    expect(screen.getByRole('status')).toHaveTextContent('The 3D view stopped working.');
  });

  it('explains when WebGL is unavailable and does not mount the 3D view', () => {
    webgl.available = false;

    renderBench();

    expect(screen.getByRole('status')).toHaveTextContent('WebGL is not available');
    expect(screen.queryByTestId('viewport')).not.toBeInTheDocument();
  });

  it('links to every configuration and marks the current one', () => {
    renderBench({ model: 'lod2', copies: 100, instancing: false });

    const nav = screen.getByRole('navigation', { name: 'Benchmark configuration' });
    expect(within(nav).getByRole('link', { name: 'LOD2' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Raw' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Raw' })).toHaveAttribute(
      'href',
      '?model=raw&copies=100&instancing=off',
    );
    expect(within(nav).getByRole('link', { name: 'On' })).toHaveAttribute(
      'href',
      '?model=lod2&copies=100&instancing=on',
    );
    expect(within(nav).getByRole('link', { name: '1,000' })).toHaveAttribute(
      'href',
      '?model=lod2&copies=1000&instancing=off',
    );
    expect(screen.getByRole('img', { name: '100 × LOD2 · Instancing: Off' })).toBeInTheDocument();
  });

  it('switches to Vietnamese and keeps the language in the address and the links', async () => {
    const user = userEvent.setup();
    renderBench();

    await user.click(screen.getByRole('radio', { name: 'VI' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Đo hiệu năng mô hình');
    expect(document.documentElement.lang).toBe('vi');
    expect(window.location.search).toBe('?model=opt&copies=1&instancing=on&lang=vi');
    expect(screen.getByRole('link', { name: 'Gốc' })).toHaveAttribute(
      'href',
      '?model=raw&copies=1&instancing=on&lang=vi',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đang bắt đầu…');
  });
});
