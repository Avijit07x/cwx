import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MODEL, VARIANT_FILES } from '../src/bench/model.ts';
import {
  exists,
  formatMegabytes,
  KTX_RELEASE,
  LOCAL_KTX_BIN,
  LOCAL_KTX_DIR,
  probeKtx,
  publicPath,
  run,
  TOOLS_DIR,
} from './toolchain.ts';

interface Expected {
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function matches(path: string, expected: Expected): Promise<boolean> {
  if (!(await exists(path))) return false;
  const bytes = await readFile(path);
  return bytes.byteLength === expected.bytes && sha256(bytes) === expected.sha256;
}

async function download(expected: Expected, path: string): Promise<void> {
  if (await matches(path, expected)) {
    console.log(`Already present and verified: ${path}`);
    return;
  }
  console.log(`Downloading ${expected.url}`);
  const response = await fetch(expected.url);
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}: ${expected.url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (bytes.byteLength !== expected.bytes || digest !== expected.sha256) {
    throw new Error(
      `Checksum mismatch for ${expected.url}: got ${bytes.byteLength} bytes, sha256 ${digest}`,
    );
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`Saved ${formatMegabytes(bytes.byteLength)} (sha256 verified) to ${path}`);
}

async function fetchModel(): Promise<void> {
  await download(MODEL, publicPath(VARIANT_FILES.raw));
  console.log(`Source: ${MODEL.page}`);
  console.log(`Licence: ${MODEL.licence} (${MODEL.licenceUrl})`);
  console.log(`Credit: ${MODEL.credit}`);
}

async function installKtx(): Promise<void> {
  const existing = await probeKtx(LOCAL_KTX_BIN);
  if (existing) {
    console.log(`KTX-Software ${existing.version} ready at ${existing.path}`);
    return;
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.log(
      `KTX-Software: no automatic download for ${process.platform}-${process.arch}. ` +
        'Install KTX-Software 4.4 or later and set KTX_BIN to its ktx binary; ' +
        'without it, pnpm assets:optimize falls back to WebP textures.',
    );
    return;
  }
  const packagePath = join(TOOLS_DIR, `KTX-Software-${KTX_RELEASE.version}-Darwin-arm64.pkg`);
  const expandedDir = join(TOOLS_DIR, `ktx-${KTX_RELEASE.version}-expanded`);
  await download(KTX_RELEASE, packagePath);
  await rm(expandedDir, { recursive: true, force: true });
  await run('pkgutil', ['--expand-full', packagePath, expandedDir]);
  const payload = (component: string) =>
    join(
      expandedDir,
      `KTX-Software-${KTX_RELEASE.version}-Darwin-arm64-${component}.pkg`,
      'Payload',
      'usr',
      'local',
    );
  await rm(LOCAL_KTX_DIR, { recursive: true, force: true });
  await mkdir(join(LOCAL_KTX_DIR, 'bin'), { recursive: true });
  await cp(join(payload('tools'), 'bin', 'ktx'), LOCAL_KTX_BIN);
  await cp(join(payload('library'), 'lib'), join(LOCAL_KTX_DIR, 'lib'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  await rm(expandedDir, { recursive: true, force: true });
  const installed = await probeKtx(LOCAL_KTX_BIN);
  if (!installed) {
    throw new Error(`Unpacked KTX-Software but ${LOCAL_KTX_BIN} --version failed.`);
  }
  console.log(
    `KTX-Software ${installed.version} unpacked to ${LOCAL_KTX_DIR} (local only, nothing installed system-wide)`,
  );
}

await fetchModel();
await installKtx();
