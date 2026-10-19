export const DEFAULT_HOST_ORIGINS: readonly string[] = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

export function parseHostOrigins(value: string): readonly string[] {
  const origins = value.split(',').flatMap((entry) => {
    const candidate = entry.trim();
    if (!URL.canParse(candidate)) return [];
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? [url.origin] : [];
  });
  return [...new Set(origins)];
}

export function resolveHostOrigins(configured: string | undefined): readonly string[] {
  return configured !== undefined && configured.trim() !== ''
    ? parseHostOrigins(configured)
    : DEFAULT_HOST_ORIGINS;
}
