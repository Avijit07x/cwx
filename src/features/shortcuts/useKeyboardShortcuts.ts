import { flushSync } from 'react-dom';
import { useHotkeys, type HotkeyCallback, type Options } from 'react-hotkeys-hook';
import {
  HOTKEY_BINDINGS,
  HOTKEY_SPLIT_KEY,
  HOTKEYS,
  isCharacterCombo,
  isIgnoredKeydown,
} from './shortcuts';
import { useShortcutStore } from './shortcutStore';

function focusableAncestors(element: Element | null): readonly HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (node.hasAttribute('tabindex')) ancestors.push(node);
  }
  return ancestors;
}

const runShortcut: HotkeyCallback = (event, { hotkey }) => {
  const shortcut = HOTKEY_BINDINGS.get(hotkey)?.shortcut;
  if (!shortcut) return;
  const focused = document.activeElement;
  const fallbacks = focusableAncestors(focused);
  if (!flushSync(() => shortcut.run(event))) return;
  event.preventDefault();
  if (focused?.isConnected === false) {
    fallbacks.find((element) => element.isConnected)?.focus({ preventScroll: true });
  }
};

const HOTKEY_OPTIONS: Options = {
  useKey: true,
  splitKey: HOTKEY_SPLIT_KEY,
  enableOnFormTags: true,
  ignoreEventWhen: isIgnoredKeydown,
  enabled: (event, { hotkey, keys }) => {
    const binding = HOTKEY_BINDINGS.get(hotkey);
    if (!binding || keys?.includes(event.key.toLowerCase()) !== true) return false;
    return useShortcutStore.getState().singleKeys || !isCharacterCombo(binding.combo);
  },
};

export function useKeyboardShortcuts(): void {
  useHotkeys(HOTKEYS, runShortcut, HOTKEY_OPTIONS);
}
