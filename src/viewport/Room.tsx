import { useEffect, useMemo } from 'react';
import { DoubleSide } from 'three';
import { FLOOR } from '../domain/grid';
import { COLORS } from './colors';
import { buildCurbGeometry, buildGridGeometry, buildNorthMarkerGeometry } from './roomGeometry';

export function Room() {
  const geometry = useMemo(
    () => ({
      grid: buildGridGeometry(),
      curb: buildCurbGeometry(),
      north: buildNorthMarkerGeometry(),
    }),
    [],
  );

  useEffect(
    () => () => {
      geometry.grid.dispose();
      geometry.curb.dispose();
      geometry.north.dispose();
    },
    [geometry],
  );

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[FLOOR.width / 2, 0, FLOOR.depth / 2]}>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshBasicMaterial
          color={COLORS.floor}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={geometry.grid}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <mesh geometry={geometry.curb}>
        <meshLambertMaterial color={COLORS.curb} />
      </mesh>
      <mesh geometry={geometry.north}>
        <meshBasicMaterial color={COLORS.north} side={DoubleSide} />
      </mesh>
    </>
  );
}
