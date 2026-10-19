import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

export const ROOT = join(import.meta.dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');
export const TOOLS_DIR = join(ROOT, 'assets-src', 'tools');

export const KTX_RELEASE = {
  version: '4.4.2',
  url: 'https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg',
  bytes: 6_785_364,
  sha256: '500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c',
} as const;

export const LOCAL_KTX_DIR = join(TOOLS_DIR, `ktx-${KTX_RELEASE.version}`);
export const LOCAL_KTX_BIN = join(LOCAL_KTX_DIR, 'bin', 'ktx');

const MIN_KTX_VERSION: readonly number[] = [4, 4, 0];

export const run = promisify(execFile);

export interface KtxTool {
  readonly path: string;
  readonly version: string;
}

export function publicPath(file: string): string {
  return join(PUBLIC_DIR, file);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function parseVersion(text: string): readonly number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isAtLeast(version: readonly number[], minimum: readonly number[]): boolean {
  for (let index = 0; index < minimum.length; index++) {
    const part = version[index] ?? 0;
    const min = minimum[index] ?? 0;
    if (part !== min) return part > min;
  }
  return true;
}

export async function probeKtx(command: string): Promise<KtxTool | null> {
  try {
    const { stdout, stderr } = await run(command, ['--version']);
    const version = parseVersion(stdout || stderr);
    if (!version || !isAtLeast(version, MIN_KTX_VERSION)) return null;
    return { path: command, version: version.join('.') };
  } catch {
    return null;
  }
}

export async function findKtx(): Promise<KtxTool | null> {
  const candidates = [process.env.KTX_BIN, LOCAL_KTX_BIN, 'ktx'];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const tool = await probeKtx(candidate);
    if (tool) return tool;
  }
  return null;
}

export function putOnPath(tool: KtxTool): void {
  if (!isAbsolute(tool.path)) return;
  process.env.PATH = [dirname(tool.path), process.env.PATH ?? ''].join(delimiter);
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(2)} MB`;
}
