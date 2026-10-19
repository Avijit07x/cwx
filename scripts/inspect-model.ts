import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO, VERSION } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { format, resolveConfig } from 'prettier';
import { MODEL, VARIANT_FILES, VARIANT_IDS, type VariantId } from '../src/bench/model.ts';
import { LODS } from './lods.ts';
import { collectStats, type ModelStats } from './stats.ts';
import { exists, findKtx, formatMegabytes, publicPath, ROOT } from './toolchain.ts';

const JSON_PATH = join(ROOT, 'docs', 'model-optimisation.json');
const REPORT_PATH = join(ROOT, 'docs', 'model-optimisation.md');
const GENERATED_HEADING = '## Asset statistics';
const LINK_BITS_PER_SECOND = 10e6;

const LABELS: Readonly<Record<VariantId, string>> = {
  raw: 'Raw (as downloaded)',
  opt: 'LOD0 (optimised)',
  lod1: 'LOD1',
  lod2: 'LOD2',
};

interface VariantStats extends ModelStats {
  readonly id: VariantId;
  readonly label: string;
  readonly file: string;
  readonly bytes: number;
  readonly transferSecondsAt10Mbps: number;
  readonly simplifyError: number | null;
  readonly colourTextureSize: number | null;
  readonly dataTextureSize: number | null;
}

interface VariantReport extends VariantStats {
  readonly trianglesVsRaw: number | null;
}

interface Report {
  readonly model: typeof MODEL;
  readonly tools: Readonly<Record<string, string | null>>;
  readonly variants: readonly VariantReport[];
}

async function packageVersion(name: string): Promise<string | null> {
  const parsed: unknown = JSON.parse(
    await readFile(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'),
  );
  return typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
    ? parsed.version
    : null;
}

async function inspectVariant(io: NodeIO, id: VariantId): Promise<VariantStats | null> {
  const path = publicPath(VARIANT_FILES[id]);
  if (!(await exists(path))) {
    console.log(`Skipping ${id}: ${path} not found.`);
    return null;
  }
  const { size } = await stat(path);
  const lod = LODS.find((spec) => spec.id === id);
  return {
    id,
    label: LABELS[id],
    file: `public/${VARIANT_FILES[id]}`,
    bytes: size,
    transferSecondsAt10Mbps: Number(((size * 8) / LINK_BITS_PER_SECOND).toFixed(2)),
    simplifyError: lod?.simplifyError ?? null,
    colourTextureSize: lod?.colourTextureSize ?? null,
    dataTextureSize: lod?.dataTextureSize ?? null,
    ...collectStats(await io.read(path)),
  };
}

const integer = (value: number) => value.toLocaleString('en-US');
const size = (bytes: number) =>
  bytes >= 1e6 ? formatMegabytes(bytes) : `${(bytes / 1e3).toFixed(1)} kB`;

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

function formatCounts(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => `${count} × ${value}`).join(', ');
}

function renderMarkdown(report: Report): string {
  const summary = table(
    [
      'Variant',
      'File size',
      'Transfer at 10 Mbps (calculated)',
      'Triangles',
      'Vertices',
      'Draw calls',
      'Meshes / primitives',
      'Materials',
    ],
    report.variants.map((variant) => [
      variant.label,
      formatMegabytes(variant.bytes),
      `${variant.transferSecondsAt10Mbps.toFixed(2)} s`,
      integer(variant.triangles),
      integer(variant.vertices),
      `${variant.drawCalls} (${variant.instancedDrawCalls} instanced)`,
      `${variant.meshes} / ${variant.primitives}`,
      String(variant.materials),
    ]),
  );
  const lods = table(
    [
      'Variant',
      'Simplify error (share of model size)',
      'Triangles vs raw',
      'Max texture size (colour / data)',
      'Textures',
      'Texture bytes',
      'GPU texture memory (estimate)',
    ],
    report.variants.map((variant) => [
      variant.label,
      variant.simplifyError === null ? '—' : `${(variant.simplifyError * 100).toFixed(2)} %`,
      variant.trianglesVsRaw === null ? '—' : `${(variant.trianglesVsRaw * 100).toFixed(1)} %`,
      variant.colourTextureSize === null || variant.dataTextureSize === null
        ? 'as authored'
        : `${variant.colourTextureSize} / ${variant.dataTextureSize} px`,
      formatCounts(variant.textures.map((texture) => texture.format)),
      formatMegabytes(variant.textureBytes),
      formatMegabytes(variant.textureGpuBytes),
    ]),
  );
  const textures = report.variants.map((variant) =>
    [
      `#### ${variant.label}`,
      '',
      table(
        ['Texture', 'Slots', 'Size', 'Format', 'Bytes', 'GPU memory (estimate)'],
        variant.textures.map((texture) => [
          texture.name,
          texture.slots.join(', '),
          `${texture.width} × ${texture.height}`,
          texture.format,
          size(texture.bytes),
          size(texture.gpuBytes),
        ]),
      ),
    ].join('\n'),
  );
  return [
    GENERATED_HEADING,
    '',
    `Generated by \`pnpm assets:inspect\` from [model-optimisation.json](model-optimisation.json). MB = 10^6 bytes. Draw calls count one draw per mesh primitive per node for a single copy, before renderer passes such as transmission are added.`,
    '',
    summary,
    '',
    '### Levels of detail',
    '',
    lods,
    '',
    '### Textures per variant',
    '',
    textures.join('\n\n'),
    '',
  ].join('\n');
}

function replaceSection(markdown: string, body: string): string | null {
  const start = markdown.indexOf(`\n${GENERATED_HEADING}\n`);
  if (start === -1) return null;
  const next = markdown.indexOf('\n## ', start + GENERATED_HEADING.length + 1);
  const end = next === -1 ? markdown.length : next + 1;
  return `${markdown.slice(0, start + 1)}${body}\n${markdown.slice(end)}`;
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const inspected: VariantStats[] = [];
  for (const id of VARIANT_IDS) {
    const variant = await inspectVariant(io, id);
    if (variant) inspected.push(variant);
  }
  const raw = inspected.find((variant) => variant.id === 'raw');
  const variants = inspected.map((variant) => ({
    ...variant,
    trianglesVsRaw: raw ? Number((variant.triangles / raw.triangles).toFixed(6)) : null,
  }));
  const ktx = await findKtx();
  const report: Report = {
    model: MODEL,
    tools: {
      node: process.version,
      gltfTransform: VERSION,
      meshoptimizer: await packageVersion('meshoptimizer'),
      sharp: await packageVersion('sharp'),
      three: await packageVersion('three'),
      ktxSoftware: ktx?.version ?? null,
    },
    variants,
  };
  await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${JSON_PATH}`);
  const markdown = renderMarkdown(report);
  const current = (await exists(REPORT_PATH)) ? await readFile(REPORT_PATH, 'utf8') : '';
  const updated = replaceSection(current, markdown);
  if (updated === null) {
    console.log(`\n${markdown}`);
    console.log(`No "${GENERATED_HEADING}" section in ${REPORT_PATH}; tables printed above.`);
    return;
  }
  const prettier = await resolveConfig(REPORT_PATH);
  await writeFile(REPORT_PATH, await format(updated, { ...prettier, filepath: REPORT_PATH }));
  console.log(`Updated the "${GENERATED_HEADING}" section of ${REPORT_PATH}`);
}

await main();
