import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAccentColor } from './colors';

const root = document.documentElement;

afterEach(() => {
  root.style.removeProperty('--color-accent');
  document.head.replaceChildren();
});

it('reads the accent token and follows a host theme written on the root element', async () => {
  const tokens = document.createElement('style');
  tokens.textContent = ':root { --color-accent: #2357d9; }';
  document.head.append(tokens);
  const { result } = renderHook(() => useAccentColor());
  expect(result.current).toBe('#2357d9');

  act(() => {
    root.style.setProperty('--color-accent', '#0b6aa2');
  });
  await waitFor(() => {
    expect(result.current).toBe('#0b6aa2');
  });

  act(() => {
    root.style.removeProperty('--color-accent');
  });
  await waitFor(() => {
    expect(result.current).toBe('#2357d9');
  });
});
