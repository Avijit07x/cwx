export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

export const INTL_LOCALE: Readonly<Record<Locale, string>> = { en: 'en-US', vi: 'vi-VN' };

export const LOCALE_LABEL: Readonly<
  Record<Locale, { readonly short: string; readonly name: string }>
> = {
  en: { short: 'EN', name: 'English' },
  vi: { short: 'VI', name: 'Tiếng Việt' },
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}
