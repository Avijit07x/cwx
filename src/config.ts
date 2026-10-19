const MAX_SEED_ITEMS = 2000;

export interface LaunchOptions {
  readonly seed: number | null;
  readonly perf: boolean;
  readonly instancing: boolean;
  readonly embed: boolean;
}

export function parseLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Math.min(Number(seed), MAX_SEED_ITEMS) : null,
    perf: params.get('perf') === '1',
    instancing: params.get('instancing') !== 'off',
    embed: params.get('embed') === '1',
  };
}

export const launchOptions = parseLaunchOptions(window.location.search);
