import { embedMessages } from '../embed/messages';
import { assistantMessages } from '../features/assistant/messages';
import { bomMessages } from '../features/bom/messages';
import { itemListMessages } from '../features/item-list/messages';
import { paletteMessages } from '../features/palette/messages';
import { propertiesMessages } from '../features/properties/messages';
import { ruleCheckMessages } from '../features/rule-check/messages';
import { shortcutsMessages } from '../features/shortcuts/messages';
import { statusBarMessages } from '../features/status-bar/messages';
import { toolbarMessages } from '../features/toolbar/messages';
import { uiMessages } from '../ui/messages';
import { viewportMessages } from '../viewport/messages';
import { commonMessages } from './common';
import type { Dictionary, MessageModule } from './define';

export const MESSAGE_MODULES = [
  commonMessages,
  paletteMessages,
  itemListMessages,
  propertiesMessages,
  ruleCheckMessages,
  bomMessages,
  toolbarMessages,
  statusBarMessages,
  shortcutsMessages,
  assistantMessages,
  viewportMessages,
  embedMessages,
  uiMessages,
] as const;

type English = (typeof MESSAGE_MODULES)[number]['en'];
type KeysOf<T> = T extends unknown ? keyof T : never;

export type MessageKey = KeysOf<English>;

export type Catalog = { readonly [K in MessageKey]: Extract<English, Record<K, string>>[K] };

function merge(language: keyof MessageModule): Dictionary {
  return Object.fromEntries(MESSAGE_MODULES.flatMap((module) => Object.entries(module[language])));
}

export const messages: MessageModule = { en: merge('en'), vi: merge('vi') };
