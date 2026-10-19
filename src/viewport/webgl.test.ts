import { describe, expect, it, vi } from 'vitest';
import { isWebGLAvailable, watchContextLoss } from './webgl';

describe('watchContextLoss', () => {
  it('keeps the context restorable and reports the loss until stopped', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const stop = watchContextLoss(canvas, onLost);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    stop();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).toHaveBeenCalledTimes(1);
  });
});

describe('isWebGLAvailable', () => {
  it('is false when the browser hands out no WebGL context', () => {
    const getContext = vi.fn(() => null);
    expect(isWebGLAvailable(() => ({ getContext }))).toBe(false);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it('is false with only WebGL 1, which three.js no longer renders with', () => {
    const available = isWebGLAvailable(() => ({
      getContext: (type: string) => (type === 'webgl' ? { getExtension: () => null } : null),
    }));
    expect(available).toBe(false);
  });

  it('is false when creating the context throws', () => {
    expect(
      isWebGLAvailable(() => ({
        getContext: () => {
          throw new Error('blocked by policy');
        },
      })),
    ).toBe(false);
  });

  it('is true when a context exists, and releases the probe context', () => {
    const loseContext = vi.fn();
    const available = isWebGLAvailable(() => ({
      getContext: () => ({ getExtension: () => ({ loseContext }) }),
    }));
    expect(available).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('checks a real canvas by default', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(isWebGLAvailable()).toBe(false);
    expect(getContext).toHaveBeenCalled();
  });
});
