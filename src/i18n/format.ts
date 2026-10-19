import { INTL_LOCALE, type Locale } from './locales';

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(
  locale: Locale,
  name: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}:${name}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALE[locale], options);
    formats.set(key, format);
  }
  return format;
}

export function formatMetres(locale: Locale, value: number): string {
  return numberFormat(locale, 'metres', {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDecimal(locale: Locale, value: number, digits = 2): string {
  return numberFormat(locale, `decimal-${String(digits)}`, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatUsd(locale: Locale, value: number): string {
  return numberFormat(locale, 'usd', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatInteger(locale: Locale, value: number): string {
  return numberFormat(locale, 'integer', { maximumFractionDigits: 0 }).format(value);
}

export function formatRatio(locale: Locale, value: number): string {
  return numberFormat(locale, 'ratio', { maximumFractionDigits: 2 }).format(value);
}

function formatUnit(locale: Locale, unit: string, value: number, digits: number): string {
  return numberFormat(locale, `${unit}-${String(digits)}`, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMilliseconds(locale: Locale, value: number, digits = 1): string {
  return formatUnit(locale, 'millisecond', value, digits);
}

export function formatMegabytes(locale: Locale, bytes: number, digits = 1): string {
  return formatUnit(locale, 'megabyte', bytes / 1e6, digits);
}

const listFormats = new Map<Locale, Intl.ListFormat>();

export function formatList(locale: Locale, values: readonly string[]): string {
  let format = listFormats.get(locale);
  if (!format) {
    format = new Intl.ListFormat(INTL_LOCALE[locale], { type: 'conjunction' });
    listFormats.set(locale, format);
  }
  return format.format(values);
}

export function formatDegrees(locale: Locale, value: number): string {
  return numberFormat(locale, 'degrees', {
    style: 'unit',
    unit: 'degree',
    unitDisplay: 'narrow',
  }).format(value);
}

export function formatCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function foldText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}
