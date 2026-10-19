import { createInstance } from 'i18next';
import type { MessageModule } from './define';
import type { Locale } from './locales';

export function createTranslate({ en, vi }: MessageModule) {
  const i18n = createInstance({
    resources: { en: { translation: en }, vi: { translation: vi } },
    fallbackLng: 'en',
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    pluralSeparator: '.',
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
  });
  void i18n.init();
  return (
    locale: Locale,
    key: string,
    params: Readonly<Record<string, string | number>> = {},
    count?: number,
  ): string => i18n.t(key, { lng: locale, count, replace: params });
}
