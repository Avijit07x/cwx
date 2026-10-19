import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { EMPTY_HISTORY, type DocState } from '../domain/history';
import type { Placement, Proposal } from '../domain/proposal';
import type { ItemId, ItemKind, PlacedItem, Point, Rotation } from '../domain/types';
import type { Locale } from '../i18n/locales';

export type Tool =
  | { readonly type: 'select' }
  | {
      readonly type: 'place';
      readonly kind: ItemKind;
      readonly rotation: Rotation;
      readonly sticky: boolean;
    };

export type DragPreview = Placement & { readonly id: ItemId };

interface Announcement {
  readonly id: number;
  readonly text: string;
}

export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error' | 'off';

export type InspectorTab = 'inspect' | 'assistant';

export type CameraView = 'perspective' | 'top';

export type ZoomDirection = 'in' | 'out';

export type TurnDirection = 1 | -1;

export interface CameraState {
  readonly view: CameraView;
  readonly seq: number;
  readonly focusId: ItemId | null;
  readonly zoom: ZoomDirection | null;
  readonly turn: TurnDirection | null;
}

interface ClipboardEntry {
  readonly kind: ItemKind;
  readonly rotation: Rotation;
}

export interface Session {
  readonly projectId: string;
  readonly projectName: string;
  readonly userId?: string;
  readonly userName: string | null;
  readonly embedded: boolean;
}

export interface EditorState extends DocState {
  readonly selectedId: ItemId | null;
  readonly hoveredId: ItemId | null;
  readonly tool: Tool;
  readonly ghost: Point | null;
  readonly drag: DragPreview | null;
  readonly proposal: Proposal | null;
  readonly clipboard: ClipboardEntry | null;
  readonly locale: Locale;
  readonly inspectorTab: InspectorTab;
  readonly camera: CameraState;
  readonly showStats: boolean;
  readonly session: Session;
  readonly announcement: Announcement | null;
  readonly saveStatus: SaveStatus;
}

export const DEFAULT_SESSION: Session = {
  projectId: 'demo',
  projectName: '',
  userName: null,
  embedded: false,
};

export function createInitialState(items: readonly PlacedItem[] = []): EditorState {
  return {
    items,
    history: EMPTY_HISTORY,
    selectedId: null,
    hoveredId: null,
    tool: { type: 'select' },
    ghost: null,
    drag: null,
    proposal: null,
    clipboard: null,
    locale: 'en',
    inspectorTab: 'inspect',
    camera: { view: 'perspective', seq: 0, focusId: null, zoom: null, turn: null },
    showStats: false,
    session: DEFAULT_SESSION,
    announcement: null,
    saveStatus: 'idle',
  };
}

export const useEditor = create<EditorState>()(subscribeWithSelector(() => createInitialState()));

export function resetEditor(items: readonly PlacedItem[] = []): void {
  useEditor.setState(createInitialState(items), true);
}

export function replaceLayout(items: readonly PlacedItem[]): void {
  useEditor.setState({
    items,
    history: EMPTY_HISTORY,
    selectedId: null,
    hoveredId: null,
    drag: null,
    ghost: null,
    proposal: null,
    tool: { type: 'select' },
  });
}
