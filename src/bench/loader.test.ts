import { describe, expect, it, vi } from 'vitest';
import { fetchGlb, isGlb, MissingModelError } from './loader';

function glb(): ArrayBuffer {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 20, true);
  return buffer;
}

describe('isGlb', () => {
  it('accepts the binary glTF magic and rejects anything else', () => {
    expect(isGlb(glb())).toBe(true);
    expect(isGlb(new TextEncoder().encode('<!doctype html><html></html>').buffer)).toBe(false);
    expect(isGlb(new ArrayBuffer(4))).toBe(false);
  });
});

describe('fetchGlb', () => {
  const signal = new AbortController().signal;

  it('bypasses the HTTP cache so every run is a cold load', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(glb()));

    const buffer = await fetchGlb('/models/a/lod0.glb', signal);

    expect(buffer.byteLength).toBe(20);
    expect(fetchMock).toHaveBeenCalledWith('/models/a/lod0.glb', { cache: 'no-store', signal });
  });

  it('reports a missing model for a 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchGlb('/models/raw/x.glb', signal)).rejects.toEqual(
      new MissingModelError('/models/raw/x.glb'),
    );
  });

  it('reports a missing model when the dev server answers with its HTML fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(fetchGlb('/models/raw/x.glb', signal)).rejects.toBeInstanceOf(MissingModelError);
  });

  it('reports other HTTP failures as errors, not as a missing file', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    const failure = fetchGlb('/models/a/lod0.glb', signal);

    await expect(failure).rejects.toThrow('HTTP 503');
    await expect(failure).rejects.not.toBeInstanceOf(MissingModelError);
  });
});
