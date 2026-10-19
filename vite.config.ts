import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip } from 'node:zlib';
import { loadEnv, type Plugin, type Rolldown } from 'vite';
import { defineConfig } from 'vitest/config';
import { parseHostOrigins, resolveHostOrigins } from './src/embed/origins.ts';

const SHARED_WITH_FIRST_SCREEN =
  /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store|@babel[\\/]runtime)[\\/]/;
const THREE_STACK = /node_modules[\\/](three[\\/]build|@react-three[\\/](fiber|drei))[\\/]/;
const UI_KIT = /[\\/]src[\\/](ui|styles)[\\/](?!messages\.ts$)|[\\/]@fontsource[\\/]/;
const VIEWPORT = /[\\/]src[\\/]viewport[\\/]Viewport\.tsx$/;
const THREE_VENDOR_BUDGET_KB = 1100;
const FIRST_SCREEN_BROTLI_BUDGET_KB = 180;
const FIRST_SCREEN_GZIP_BUDGET_KB = 205;
const LAZY_3D_BROTLI_BUDGET_KB = 240;

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

function chunksReachedFrom(
  bundle: Rolldown.OutputBundle,
  start: readonly string[],
  next: (chunk: Rolldown.OutputChunk) => readonly string[],
): Rolldown.OutputChunk[] {
  const reached = new Map<string, Rolldown.OutputChunk>();
  const visit = (fileName: string) => {
    const output = bundle[fileName];
    if (output?.type !== 'chunk' || reached.has(fileName)) return;
    reached.set(fileName, output);
    next(output).forEach(visit);
  };
  start.forEach(visit);
  return [...reached.values()];
}

async function compressedKb(
  chunks: readonly Rolldown.OutputChunk[],
  compress: (code: string) => Promise<Uint8Array>,
): Promise<number> {
  const sizes = await Promise.all(chunks.map(async (chunk) => (await compress(chunk.code)).length));
  return sizes.reduce((sum, size) => sum + size, 0) / 1000;
}

function guardEditorBundle(): Plugin {
  return {
    name: 'guard-editor-bundle',
    async generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
      const editor = chunks.find((chunk) => chunk.isEntry && chunk.name === 'editor');
      if (!editor) return;
      const firstScreen = chunksReachedFrom(bundle, [editor.fileName], (chunk) => chunk.imports);
      if (firstScreen.some((chunk) => chunk.moduleIds.some((id) => THREE_STACK.test(id)))) {
        this.error(
          'three.js is on the editor’s first screen. Add the package it shares with the 3D stack to SHARED_WITH_FIRST_SCREEN.',
        );
      }
      const viewport = chunks.filter((chunk) => chunk.moduleIds.some((id) => VIEWPORT.test(id)));
      if (viewport.length === 0) {
        this.error('No chunk holds src/viewport/Viewport.tsx. Point VIEWPORT at the 3D view.');
      }
      const onFirstScreen = new Set(firstScreen.map((chunk) => chunk.fileName));
      const lazy3d = chunksReachedFrom(
        bundle,
        viewport.map((chunk) => chunk.fileName),
        (chunk) =>
          [...chunk.imports, ...chunk.dynamicImports].filter(
            (fileName) => !onFirstScreen.has(fileName),
          ),
      );
      const [firstScreenBrotli, firstScreenGzip, lazy3dBrotli] = await Promise.all([
        compressedKb(firstScreen, compressBrotli),
        compressedKb(firstScreen, compressGzip),
        compressedKb(lazy3d, compressBrotli),
      ]);
      const budgets: readonly { part: string; after: string; kb: number; budget: number }[] = [
        {
          part: 'first screen',
          after: 'Brotli',
          kb: firstScreenBrotli,
          budget: FIRST_SCREEN_BROTLI_BUDGET_KB,
        },
        {
          part: 'first screen',
          after: 'gzip',
          kb: firstScreenGzip,
          budget: FIRST_SCREEN_GZIP_BUDGET_KB,
        },
        {
          part: 'lazy 3D view',
          after: 'Brotli',
          kb: lazy3dBrotli,
          budget: LAZY_3D_BROTLI_BUDGET_KB,
        },
      ];
      for (const { part, after, kb, budget } of budgets) {
        const size = `The editor's ${part} is ${kb.toFixed(1)} kB of JavaScript after ${after}`;
        if (kb > budget) this.error(`${size}, over its ${String(budget)} kB budget.`);
        this.info(`${size}, within its ${String(budget)} kB budget.`);
      }
    },
  };
}

function dropRawModels(): Plugin {
  return {
    name: 'drop-raw-models',
    apply: 'build',
    writeBundle({ dir }) {
      if (dir !== undefined) rmSync(join(dir, 'models', 'raw'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode, isPreview }) => {
  const configured = loadEnv(mode, import.meta.dirname, 'VITE_').VITE_HOST_ORIGINS;
  const hostOrigins = isPreview
    ? parseHostOrigins(configured ?? '')
    : resolveHostOrigins(configured);
  const headers = {
    'Content-Security-Policy': `frame-ancestors ${["'self'", ...hostOrigins].join(' ')}`,
  };

  return {
    plugins: [react(), guardEditorBundle(), dropRawModels()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, headers },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, headers },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: THREE_VENDOR_BUDGET_KB,
      rolldownOptions: {
        input: {
          editor: resolve(import.meta.dirname, 'index.html'),
          host: resolve(import.meta.dirname, 'host.html'),
          bench: resolve(import.meta.dirname, 'bench.html'),
        },
        output: {
          codeSplitting: {
            groups: [
              { name: 'react-vendor', test: SHARED_WITH_FIRST_SCREEN, priority: 1 },
              { name: 'three-vendor', test: THREE_STACK },
              { name: 'ui-kit', test: UI_KIT, minShareCount: 2 },
            ],
          },
        },
      },
    },
    resolve: mode === 'test' ? { mainFields: ['module'] } : {},
    test: {
      restoreMocks: true,
      projects: [
        { test: { name: 'node', include: ['src/domain/**/*.test.ts', 'scripts/**/*.test.ts'] } },
        {
          test: {
            name: 'jsdom',
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: ['src/domain/**/*.test.ts'],
          },
        },
      ],
    },
  };
});
