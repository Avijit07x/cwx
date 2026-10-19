import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { setCameraView, zoomCamera } from '../state/actions';
import { resetEditor } from '../state/store';
import Viewport from './Viewport';

const scene = vi.hoisted(() => ({ renders: 0, onUserCameraMove: (): void => undefined }));

vi.mock('./webgl', () => ({ isWebGLAvailable: () => true }));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('./Scene', () => ({
  Scene: ({ onUserCameraMove }: { readonly onUserCameraMove: () => void }) => {
    scene.renders += 1;
    scene.onUserCameraMove = onUserCameraMove;
    return null;
  },
}));

beforeEach(() => {
  resetEditor([]);
  scene.renders = 0;
});

it('keeps zooming, camera presets and the view control from re-rendering the 3D scene', () => {
  render(<Viewport singleKeys />);
  const renders = scene.renders;

  act(() => {
    zoomCamera('in');
    scene.onUserCameraMove();
  });
  expect(screen.getByRole('radio', { name: '3D' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Top' })).not.toBeChecked();

  act(() => {
    setCameraView('top');
  });
  expect(screen.getByRole('radio', { name: 'Top' })).toBeChecked();
  expect(scene.renders).toBe(renders);
});
