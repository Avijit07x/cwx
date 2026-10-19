import type { VariantId } from '../src/bench/model.ts';

export interface LodSpec {
  readonly id: Exclude<VariantId, 'raw'>;
  readonly simplifyError: number;
  readonly colourTextureSize: number;
  readonly dataTextureSize: number;
}

export const LODS: readonly LodSpec[] = [
  { id: 'opt', simplifyError: 0.001, colourTextureSize: 1024, dataTextureSize: 512 },
  { id: 'lod1', simplifyError: 0.002, colourTextureSize: 512, dataTextureSize: 256 },
  { id: 'lod2', simplifyError: 0.004, colourTextureSize: 256, dataTextureSize: 128 },
];
