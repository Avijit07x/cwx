import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Rect } from '../domain/types';
import { haloFillGeometry } from './segments';

interface FatLinesProps {
  readonly positions: Float32Array;
  readonly color: string;
  readonly width: number;
  readonly opacity?: number;
  readonly dashed?: boolean;
}

const DASH_METRES = 0.15;
const GAP_METRES = 0.1;

export function FatLines({ positions, color, width, opacity = 1, dashed = false }: FatLinesProps) {
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(
    () =>
      new LineMaterial({
        color,
        linewidth: width,
        opacity,
        transparent: opacity < 1,
        dashed,
        dashSize: DASH_METRES,
        gapSize: GAP_METRES,
      }),
    [color, width, opacity, dashed],
  );
  const lines = useMemo(() => {
    const segments = new LineSegments2(
      new LineSegmentsGeometry().setPositions(positions),
      material,
    );
    return dashed ? segments.computeLineDistances() : segments;
  }, [positions, material, dashed]);

  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  useEffect(() => {
    invalidate();
    return () => {
      lines.geometry.dispose();
      invalidate();
    };
  }, [lines, invalidate]);

  return positions.length > 0 ? <primitive object={lines} /> : null;
}

interface HaloFillProps {
  readonly rect: Rect;
  readonly color: string;
  readonly opacity?: number;
}

export function HaloFill({ rect, color, opacity = 0.08 }: HaloFillProps) {
  const geometry = useMemo(() => haloFillGeometry(rect), [rect]);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
