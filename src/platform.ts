export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

interface ShortcutOptions {
  readonly mod?: boolean;
  readonly shift?: boolean;
}

export function shortcutLabel(
  key: string,
  { mod = false, shift = false }: ShortcutOptions = {},
): string {
  if (isMac) return `${shift ? '⇧' : ''}${mod ? '⌘' : ''}${key}`;
  return [mod && 'Ctrl', shift && 'Shift', key].filter(Boolean).join('+');
}

export function ariaShortcut(
  key: string,
  { mod = false, shift = false }: ShortcutOptions = {},
): string {
  return [mod && (isMac ? 'Meta' : 'Control'), shift && 'Shift', key].filter(Boolean).join('+');
}

export const UNDO_SHORTCUT = shortcutLabel('Z', { mod: true });
export const COPY_SHORTCUT = shortcutLabel('C', { mod: true });
export const PASTE_SHORTCUT = shortcutLabel('V', { mod: true });
