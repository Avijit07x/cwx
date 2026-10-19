import { create } from 'zustand';
import type { Point } from '../domain/types';

interface CursorState {
  readonly point: Point | null;
}

export const useCursor = create<CursorState>()(() => ({ point: null }));

export function setCursorPoint(point: Point | null): void {
  const current = useCursor.getState().point;
  if (current === point) return;
  if (current && point && current.x === point.x && current.z === point.z) return;
  useCursor.setState({ point });
}

export function useCursorPoint(): Point | null {
  return useCursor((state) => state.point);
}
