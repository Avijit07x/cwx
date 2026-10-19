import { create } from 'zustand';
import { readStorage, storageKey, writeStorage } from '../../state/persistence';

export const SINGLE_KEY_STORAGE_KEY = storageKey('single-key-shortcuts');

export function readSingleKeyPreference(): boolean {
  return readStorage(SINGLE_KEY_STORAGE_KEY) !== 'off';
}

interface ShortcutState {
  readonly helpOpen: boolean;
  readonly singleKeys: boolean;
}

export const useShortcutStore = create<ShortcutState>()(() => ({
  helpOpen: false,
  singleKeys: readSingleKeyPreference(),
}));

export function setShortcutHelpOpen(open: boolean): void {
  useShortcutStore.setState({ helpOpen: open });
}

export function setSingleKeyShortcuts(enabled: boolean): void {
  useShortcutStore.setState({ singleKeys: enabled });
  writeStorage(SINGLE_KEY_STORAGE_KEY, enabled ? 'on' : 'off');
}
