import { useSyncExternalStore } from 'react';
import type { ItemKind } from '../domain/types';

export const COLORS = {
  background: '#dfe4e9',
  floor: '#eef1f4',
  gridMinor: '#d8dde3',
  gridMid: '#c3cad2',
  gridMajor: '#a3adb8',
  curb: '#b4bcc5',
  north: '#5f6a76',
  sky: '#ffffff',
  ground: '#aab3bd',
  enclosure: '#d3d8de',
  plinth: '#4a5561',
  trim: '#2a3139',
  frame: '#4a5561',
  steel: '#8e98a3',
  screen: '#86cfc4',
  led: '#1f9d63',
  danger: '#c4320a',
  success: '#0f7a55',
  ai: '#6a3fd4',
  hover: '#4a5561',
  idleTint: '#ffffff',
  violatingTint: '#f5a089',
} as const;

export const KIND_COLORS: Readonly<Record<ItemKind, string>> = {
  cabinet: '#5b6b7f',
  drive: '#0e7c74',
  transformer: '#b25e0c',
  ups: '#5146c2',
};

function watchRootStyle(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['style'] });
  return () => {
    observer.disconnect();
  };
}

function readAccentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
}

export function useAccentColor(): string {
  return useSyncExternalStore(watchRootStyle, readAccentColor);
}
