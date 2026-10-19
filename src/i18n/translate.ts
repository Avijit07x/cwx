import type { ItemKind } from '../domain/types';
import type { ParamArgs, PluralArgs } from './define';
import { createTranslate } from './engine';
import {
  formatDecimal,
  formatDegrees,
  formatInteger,
  formatList,
  formatMetres,
  formatUsd,
} from './format';
import type { Locale } from './locales';
import { messages, type Catalog, type MessageKey } from './messages';

type PluralBaseOf<All extends string> = {
  [K in All]: K extends `${infer Base}.other` ? (`${Base}.one` extends All ? Base : never) : never;
}[All];

type PluralKey = PluralBaseOf<MessageKey>;

const translate = createTranslate(messages);

export interface Translator {
  readonly locale: Locale;
  t<K extends MessageKey>(key: K, ...params: ParamArgs<Catalog[K]>): string;
  plural<K extends PluralKey>(
    key: K,
    count: number,
    ...params: PluralArgs<Catalog[`${K}.one` | `${K}.other`]>
  ): string;
  metres(value: number): string;
  decimal(value: number, digits?: number): string;
  usd(value: number): string;
  integer(value: number): string;
  degrees(value: number): string;
  list(values: readonly string[]): string;
  kindName(kind: ItemKind): string;
  kindShort(kind: ItemKind): string;
}

function createTranslator(locale: Locale): Translator {
  const t: Translator['t'] = (key, ...[params]) => translate(locale, key, params);
  return {
    locale,
    t,
    plural: (key, count, ...[params]) =>
      translate(locale, key, { count: formatInteger(locale, count), ...params }, count),
    metres: (value) => formatMetres(locale, value),
    decimal: (value, digits) => formatDecimal(locale, value, digits),
    usd: (value) => formatUsd(locale, value),
    integer: (value) => formatInteger(locale, value),
    degrees: (value) => formatDegrees(locale, value),
    list: (values) => formatList(locale, values),
    kindName: (kind) => t(`item.${kind}.name`),
    kindShort: (kind) => t(`item.${kind}.short`),
  };
}

const translators = new Map<Locale, Translator>();

export function getTranslator(locale: Locale): Translator {
  let translator = translators.get(locale);
  if (!translator) {
    translator = createTranslator(locale);
    translators.set(locale, translator);
  }
  return translator;
}
