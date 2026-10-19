import { FLOOR } from '../../domain/grid';
import { ITEM_KINDS, type ItemKind, type Point } from '../../domain/types';
import type { Translator } from '../../i18n/translate';
import { ariaShortcut, shortcutLabel } from '../../platform';
import {
  cancelDrag,
  cancelTool,
  copySelection,
  duplicateSelection,
  focusSelection,
  nudgeSelection,
  pasteClipboard,
  placeAtGhost,
  redo,
  removeSelection,
  rotateSelection,
  select,
  selectRelative,
  startPlacement,
  undo,
  zoomCamera,
} from '../../state/actions';
import { useEditor } from '../../state/store';
import { useCursor } from '../../viewport/cursorStore';
import { setShortcutHelpOpen, useShortcutStore } from './shortcutStore';

export const SHORTCUT_GROUPS = ['select', 'move', 'edit', 'place', 'view', 'help'] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export const HOTKEY_SPLIT_KEY = '&';

interface KeyCombo {
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
}

export type ShortcutId =
  | 'select-previous'
  | 'select-next'
  | 'focus'
  | 'escape'
  | 'nudge'
  | 'nudge-far'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | `pick-${ItemKind}`
  | 'place'
  | 'place-keep'
  | 'zoom-in'
  | 'zoom-out'
  | 'help';

interface Shortcut {
  readonly id: ShortcutId;
  readonly group: ShortcutGroup;
  readonly combos: readonly KeyCombo[];
  readonly describe: (t: Translator) => string;
  readonly run: (event: KeyboardEvent) => boolean;
}

export interface ShortcutHint {
  readonly label: string;
  readonly aria: string;
}

const editor = useEditor.getState;

const ARROW_STEPS: Readonly<Record<string, Point>> = {
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

const ARROW_KEYS = Object.keys(ARROW_STEPS);

function hasSelection(): boolean {
  return editor().selectedId !== null;
}

function isPlacing(): boolean {
  return editor().tool.type === 'place';
}

function always(action: () => unknown): () => boolean {
  return () => {
    action();
    return true;
  };
}

function withSelection(action: () => unknown): () => boolean {
  return () => {
    if (!hasSelection()) return false;
    action();
    return true;
  };
}

function nudgeBy(cells: number) {
  return (event: KeyboardEvent): boolean => {
    const step = ARROW_STEPS[event.key];
    if (!step || editor().drag || !(isPlacing() || hasSelection())) return false;
    nudgeSelection(step.x * cells, step.z * cells);
    return true;
  };
}

function rotateBy(direction: 1 | -1) {
  return (): boolean => {
    if (!editor().drag && !isPlacing() && !hasSelection()) return false;
    rotateSelection(direction);
    return true;
  };
}

function placeAtPreview(keepPlacing: boolean) {
  return (): boolean => {
    if (!isPlacing()) return false;
    placeAtGhost({ keepPlacing });
    return true;
  };
}

function selectStep(step: 1 | -1) {
  return (): boolean => {
    if (editor().items.length === 0) return false;
    selectRelative(step);
    return true;
  };
}

function cancelOrDeselect(): boolean {
  if (cancelDrag() || cancelTool()) return true;
  if (!hasSelection()) return false;
  select(null, { announce: true });
  return true;
}

function hasTextSelection(): boolean {
  return (window.getSelection()?.toString() ?? '') !== '';
}

function copy(): boolean {
  if (hasTextSelection() || !hasSelection()) return false;
  copySelection();
  return true;
}

function paste(): boolean {
  pasteClipboard(useCursor.getState().point ?? undefined);
  return true;
}

function arrowCombos(shift: boolean): KeyCombo[] {
  return ARROW_KEYS.map((key) => ({ key, shift }));
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'select-previous',
    group: 'select',
    combos: [{ key: '[' }],
    describe: (t) => t.t('shortcuts.selectPrevious'),
    run: selectStep(-1),
  },
  {
    id: 'select-next',
    group: 'select',
    combos: [{ key: ']' }],
    describe: (t) => t.t('shortcuts.selectNext'),
    run: selectStep(1),
  },
  {
    id: 'focus',
    group: 'select',
    combos: [{ key: 'f', shift: false }],
    describe: (t) => t.t('shortcuts.focus'),
    run: withSelection(focusSelection),
  },
  {
    id: 'escape',
    group: 'select',
    combos: [{ key: 'Escape' }],
    describe: (t) => t.t('shortcuts.escape'),
    run: cancelOrDeselect,
  },
  {
    id: 'nudge',
    group: 'move',
    combos: arrowCombos(false),
    describe: (t) => t.t('shortcuts.nudge', { distance: t.metres(FLOOR.cell) }),
    run: nudgeBy(1),
  },
  {
    id: 'nudge-far',
    group: 'move',
    combos: arrowCombos(true),
    describe: (t) => t.t('shortcuts.nudgeFar', { distance: t.metres(FLOOR.cell * 2) }),
    run: nudgeBy(2),
  },
  {
    id: 'rotate-cw',
    group: 'move',
    combos: [{ key: 'r', shift: false }],
    describe: (t) => t.t('shortcuts.rotateCw'),
    run: rotateBy(1),
  },
  {
    id: 'rotate-ccw',
    group: 'move',
    combos: [{ key: 'r', shift: true }],
    describe: (t) => t.t('shortcuts.rotateCcw'),
    run: rotateBy(-1),
  },
  {
    id: 'undo',
    group: 'edit',
    combos: [{ key: 'z', mod: true, shift: false }],
    describe: (t) => t.t('shortcuts.undo'),
    run: always(undo),
  },
  {
    id: 'redo',
    group: 'edit',
    combos: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true, shift: false },
    ],
    describe: (t) => t.t('shortcuts.redo'),
    run: always(redo),
  },
  {
    id: 'copy',
    group: 'edit',
    combos: [{ key: 'c', mod: true, shift: false }],
    describe: (t) => t.t('shortcuts.copy'),
    run: copy,
  },
  {
    id: 'paste',
    group: 'edit',
    combos: [{ key: 'v', mod: true, shift: false }],
    describe: (t) => t.t('shortcuts.paste'),
    run: paste,
  },
  {
    id: 'duplicate',
    group: 'edit',
    combos: [{ key: 'd', mod: true, shift: false }],
    describe: (t) => t.t('shortcuts.duplicate'),
    run: withSelection(duplicateSelection),
  },
  {
    id: 'delete',
    group: 'edit',
    combos: [{ key: 'Delete' }, { key: 'Backspace' }],
    describe: (t) => t.t('shortcuts.delete'),
    run: withSelection(removeSelection),
  },
  ...ITEM_KINDS.map((kind, index): Shortcut => ({
    id: `pick-${kind}`,
    group: 'place',
    combos: [{ key: String(index + 1) }],
    describe: (t) => t.t('shortcuts.pick', { kind: t.kindShort(kind) }),
    run: always(() => {
      startPlacement(kind);
    }),
  })),
  {
    id: 'place',
    group: 'place',
    combos: [{ key: 'Enter', shift: false }],
    describe: (t) => t.t('shortcuts.place'),
    run: placeAtPreview(false),
  },
  {
    id: 'place-keep',
    group: 'place',
    combos: [{ key: 'Enter', shift: true }],
    describe: (t) => t.t('shortcuts.placeKeep'),
    run: placeAtPreview(true),
  },
  {
    id: 'zoom-in',
    group: 'view',
    combos: [{ key: '+' }, { key: '=' }],
    describe: (t) => t.t('shortcuts.zoomIn'),
    run: always(() => {
      zoomCamera('in');
    }),
  },
  {
    id: 'zoom-out',
    group: 'view',
    combos: [{ key: '-' }],
    describe: (t) => t.t('shortcuts.zoomOut'),
    run: always(() => {
      zoomCamera('out');
    }),
  },
  {
    id: 'help',
    group: 'help',
    combos: [{ key: '?' }],
    describe: (t) => t.t('shortcuts.help'),
    run: always(() => {
      setShortcutHelpOpen(true);
    }),
  },
];

export function isCharacterCombo(combo: KeyCombo): boolean {
  return combo.mod !== true && combo.key.length === 1;
}

export function isSingleKeyShortcut(shortcut: Shortcut): boolean {
  return shortcut.combos.every(isCharacterCombo);
}

interface HotkeyBinding {
  readonly shortcut: Shortcut;
  readonly combo: KeyCombo;
}

function hotkeysFor(combo: KeyCombo): readonly string[] {
  const split = HOTKEY_SPLIT_KEY;
  const mods = combo.mod === true ? [`ctrl${split}`, `meta${split}`] : [''];
  const shifts =
    combo.shift === undefined ? ['', `shift${split}`] : [combo.shift ? `shift${split}` : ''];
  const key = combo.key.toLowerCase();
  return mods.flatMap((mod) => shifts.map((shift) => `${mod}${shift}${key}`));
}

const HOTKEY_ENTRIES = SHORTCUTS.flatMap((shortcut) =>
  shortcut.combos.flatMap((combo) =>
    hotkeysFor(combo).map((hotkey): readonly [string, HotkeyBinding] => [
      hotkey,
      { shortcut, combo },
    ]),
  ),
);

export const HOTKEYS: readonly string[] = HOTKEY_ENTRIES.map(([hotkey]) => hotkey);

export const HOTKEY_BINDINGS: ReadonlyMap<string, HotkeyBinding> = new Map(HOTKEY_ENTRIES);

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextEntry(element: Element): boolean {
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

const OPEN_DIALOG = 'dialog[open], [role="dialog"], [role="alertdialog"]';

const ACTIVATION_KEYS = ['Enter', ' '];

const ACTIVATABLE =
  'button, a[href], summary, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"]';

const ARROW_KEY_OWNERS = '[role="log"], [role="toolbar"]';

const SCROLL_REGIONS = '[role="region"][tabindex], [role="tabpanel"]';

function isDisabledControl(element: Element | null): boolean {
  return element?.getAttribute('aria-disabled') === 'true';
}

export function isIgnoredKeydown(event: KeyboardEvent): boolean {
  if (event.isComposing || event.key === 'Process') return true;
  if (useShortcutStore.getState().helpOpen) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (event.defaultPrevented && !isDisabledControl(target)) return true;
  if (target === null) return false;
  if (target.closest(OPEN_DIALOG) !== null || isTextEntry(target)) return true;
  if (ACTIVATION_KEYS.includes(event.key) && target.closest(ACTIVATABLE) !== null) return true;
  return (
    ARROW_KEYS.includes(event.key) &&
    (target instanceof HTMLInputElement ||
      target.matches(SCROLL_REGIONS) ||
      target.closest(ARROW_KEY_OWNERS) !== null)
  );
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
};

function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

export function comboLabel(combo: KeyCombo): string {
  return shortcutLabel(keyLabel(combo.key), { mod: combo.mod, shift: combo.shift });
}

function comboAria(combo: KeyCombo): string {
  const key = combo.key.length === 1 ? combo.key.toUpperCase() : combo.key;
  return ariaShortcut(key, { mod: combo.mod, shift: combo.shift });
}

export function shortcutHint(id: ShortcutId, singleKeys: boolean): ShortcutHint | undefined {
  const combos =
    SHORTCUTS.find((shortcut) => shortcut.id === id)?.combos.filter(
      (combo) => singleKeys || !isCharacterCombo(combo),
    ) ?? [];
  const [first] = combos;
  return first ? { label: comboLabel(first), aria: combos.map(comboAria).join(' ') } : undefined;
}

export const SINGLE_KEY_LABELS: readonly string[] = [
  ...new Set(
    SHORTCUTS.flatMap((shortcut) =>
      shortcut.combos.filter(isCharacterCombo).map((combo) => keyLabel(combo.key)),
    ),
  ),
];
