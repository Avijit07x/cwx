import { vi } from 'vitest';
import {
  envelope,
  parseEditorMessage,
  type EditorMessage,
  type HostMessage,
} from '../embed/protocol';

export const HOST_ORIGIN = 'http://127.0.0.1:5173';
export const OTHER_ALLOWED_ORIGIN = 'http://127.0.0.1:4173';
export const ALLOWED_ORIGINS: readonly string[] = [HOST_ORIGIN, OTHER_ALLOWED_ORIGIN];

export interface SentMessage {
  readonly message: EditorMessage | null;
  readonly data: unknown;
  readonly targetOrigin: unknown;
}

export interface FakeHost {
  readonly window: Window;
  readonly sent: () => readonly SentMessage[];
  readonly sentOfType: <T extends EditorMessage['type']>(
    type: T,
  ) => readonly Extract<EditorMessage, { readonly type: T }>[];
  readonly clear: () => void;
  readonly deliver: (
    data: unknown,
    from?: { readonly origin?: string; readonly source?: Window | null },
  ) => void;
  readonly send: (message: HostMessage, origin?: string) => void;
  readonly observed: () => readonly Element[];
  readonly resizeContent: () => void;
}

function isOfType<T extends EditorMessage['type']>(
  type: T,
): (message: EditorMessage | null) => message is Extract<EditorMessage, { readonly type: T }> {
  return (message): message is Extract<EditorMessage, { readonly type: T }> =>
    message?.type === type;
}

function fakeResizeObservers() {
  const live = new Set<FakeResizeObserver>();

  class FakeResizeObserver implements ResizeObserver {
    readonly targets = new Set<Element>();
    readonly #callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
      live.add(this);
    }

    observe(target: Element): void {
      this.targets.add(target);
    }

    unobserve(target: Element): void {
      this.targets.delete(target);
    }

    disconnect(): void {
      live.delete(this);
    }

    notify(): void {
      this.#callback([], this);
    }
  }

  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    observed: () => [...live].flatMap((observer) => [...observer.targets]),
    resizeContent: () => {
      for (const observer of live) observer.notify();
    },
  };
}

export function frameInFakeHost(): FakeHost {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const hostWindow = frame.contentWindow;
  if (!hostWindow) throw new Error('The test iframe has no window');
  vi.spyOn(window, 'parent', 'get').mockReturnValue(hostWindow);
  const posts: { readonly data: unknown; readonly targetOrigin: unknown }[] = [];
  vi.spyOn(hostWindow, 'postMessage').mockImplementation((data: unknown, targetOrigin: unknown) => {
    posts.push({ data, targetOrigin });
  });
  const sent = () => posts.map((post) => ({ ...post, message: parseEditorMessage(post.data) }));
  const deliver: FakeHost['deliver'] = (
    data,
    { origin = HOST_ORIGIN, source = hostWindow } = {},
  ) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  };
  return {
    window: hostWindow,
    sent,
    sentOfType: (type) =>
      sent()
        .map((post) => post.message)
        .filter(isOfType(type)),
    clear: () => {
      posts.length = 0;
    },
    deliver,
    send: (message, origin = HOST_ORIGIN) => {
      deliver(envelope(message), { origin });
    },
    ...fakeResizeObservers(),
  };
}
