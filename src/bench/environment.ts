import type { WebGLRenderer } from 'three';
import { readGpuName, readHeapBytes } from '../viewport/perf';

export interface EnvironmentInfo {
  readonly gpu: string;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly pixelRatio: number;
  readonly heapBytes: number | null;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly userAgent: string;
}

export function readEnvironment(renderer: WebGLRenderer): EnvironmentInfo {
  const canvas = renderer.domElement;
  return {
    gpu: readGpuName(renderer.getContext()),
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
    pixelRatio: renderer.getPixelRatio(),
    heapBytes: readHeapBytes(),
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    userAgent: navigator.userAgent,
  };
}
