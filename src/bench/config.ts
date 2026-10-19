import { isLocale, type Locale } from '../i18n/locales';
import { VARIANT_IDS, type VariantId } from './model';

export const COPY_COUNTS = [1, 100, 1000] as const;
export type CopyCount = (typeof COPY_COUNTS)[number];

export interface BenchConfig {
  readonly model: VariantId;
  readonly copies: CopyCount;
  readonly instancing: boolean;
  readonly locale: Locale;
}

export const DEFAULT_CONFIG: BenchConfig = {
  model: 'opt',
  copies: 1,
  instancing: true,
  locale: 'en',
};

function isVariantId(value: unknown): value is VariantId {
  return VARIANT_IDS.some((id) => id === value);
}

export function parseBenchConfig(search: string): BenchConfig {
  const params = new URLSearchParams(search);
  const model = params.get('model');
  const copies = Number(params.get('copies'));
  const locale = params.get('lang');
  return {
    model: isVariantId(model) ? model : DEFAULT_CONFIG.model,
    copies: COPY_COUNTS.find((count) => count === copies) ?? DEFAULT_CONFIG.copies,
    instancing: params.get('instancing') !== 'off',
    locale: isLocale(locale) ? locale : DEFAULT_CONFIG.locale,
  };
}

export function configSearch(config: BenchConfig): string {
  const params = new URLSearchParams({
    model: config.model,
    copies: String(config.copies),
    instancing: config.instancing ? 'on' : 'off',
  });
  if (config.locale !== DEFAULT_CONFIG.locale) params.set('lang', config.locale);
  return `?${params.toString()}`;
}
