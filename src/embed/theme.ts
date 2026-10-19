import type { Theme, ThemeFont } from './protocol';

export const MIN_ACCENT_CONTRAST = 4.5;

const FONT_STACKS: Readonly<Record<ThemeFont, string>> = {
  'IBM Plex Sans': "'IBM Plex Sans', system-ui, sans-serif",
  'system-ui': "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif",
  'Segoe UI': "'Segoe UI', system-ui, sans-serif",
  Roboto: 'Roboto, system-ui, sans-serif',
  'Noto Sans': "'Noto Sans', system-ui, sans-serif",
};

const THEMED_PROPERTIES = [
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-active',
  '--color-accent-subtle',
  '--color-accent-border',
  '--color-focus',
  '--font-sans',
  '--radius-sm',
  '--radius-md',
] as const;

type ThemedProperty = (typeof THEMED_PROPERTIES)[number];

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function contrastWithWhite(hex: string): number {
  const rgb = Number.parseInt(hex.slice(1), 16);
  const luminance =
    0.2126 * linearChannel((rgb >> 16) & 0xff) +
    0.7152 * linearChannel((rgb >> 8) & 0xff) +
    0.0722 * linearChannel(rgb & 0xff);
  return 1.05 / (luminance + 0.05);
}

export function isReadableAccent(hex: string): boolean {
  return contrastWithWhite(hex) >= MIN_ACCENT_CONTRAST;
}

function themeVariables({
  accent,
  fontFamily,
  radius,
}: Theme): Partial<Record<ThemedProperty, string>> {
  return {
    ...(accent !== undefined && {
      '--color-accent': accent,
      '--color-accent-hover': `color-mix(in srgb, ${accent} 86%, black)`,
      '--color-accent-active': `color-mix(in srgb, ${accent} 72%, black)`,
      '--color-accent-subtle': `color-mix(in srgb, ${accent} 9%, white)`,
      '--color-accent-border': `color-mix(in srgb, ${accent} 38%, white)`,
      '--color-focus': accent,
    }),
    ...(fontFamily !== undefined && { '--font-sans': FONT_STACKS[fontFamily] }),
    ...(radius !== undefined && {
      '--radius-sm': `${Math.round(radius * 0.6)}px`,
      '--radius-md': `${radius}px`,
    }),
  };
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  const variables = themeVariables(theme);
  for (const property of THEMED_PROPERTIES) {
    const value = variables[property];
    if (value === undefined) root.style.removeProperty(property);
    else root.style.setProperty(property, value);
  }
}
