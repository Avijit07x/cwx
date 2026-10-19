export type Dictionary = Readonly<Record<string, string>>;

export interface MessageModule<E extends Dictionary = Dictionary> {
  readonly en: E;
  readonly vi: Readonly<Record<keyof E, string>>;
}

type Placeholders<T> = T extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type Args<Names extends string> = [Names] extends [never]
  ? []
  : [params: Readonly<Record<Names, string | number>>];

export type ParamArgs<T> = Args<Placeholders<T>>;

export type PluralArgs<T> = Args<Exclude<Placeholders<T>, 'count'>>;

export function defineMessages<const E extends Dictionary>(
  en: E,
  vi: Readonly<Record<NoInfer<keyof E>, string>>,
): MessageModule<E> {
  return { en, vi };
}
