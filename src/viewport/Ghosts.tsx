import { useEffect, useMemo } from 'react';
import { MeshLambertMaterial } from 'three';
import type { Proposal } from '../domain/proposal';
import type { ItemKind, Point, Rotation } from '../domain/types';
import { selectEffectiveIndex } from '../state/selectors';
import { useEditor } from '../state/store';
import { FatLines, HaloFill } from './FatLines';
import { kindGeometry, yaw } from './geometry';
import { placementMarks, proposalSegments } from './segments';
import { COLORS } from './colors';

function useGhostMaterial(color: string | null, opacity: number): MeshLambertMaterial {
  const material = useMemo(
    () =>
      new MeshLambertMaterial({
        color: color ?? '#ffffff',
        vertexColors: color === null,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    [color, opacity],
  );
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );
  return material;
}

interface PlacementPreviewProps {
  readonly kind: ItemKind;
  readonly rotation: Rotation;
  readonly at: Point;
}

function PlacementPreview({ kind, rotation, at }: PlacementPreviewProps) {
  const items = useEditor((state) => state.items);
  const material = useGhostMaterial(null, 0.55);
  const marks = useMemo(
    () => placementMarks(kind, rotation, at, items),
    [kind, rotation, at, items],
  );
  const color = marks.valid ? COLORS.success : COLORS.danger;
  return (
    <>
      <mesh
        geometry={kindGeometry(kind)}
        material={material}
        position={[at.x, 0, at.z]}
        rotation-y={yaw(rotation)}
        dispose={null}
      />
      <FatLines positions={marks.outline} color={color} width={2} dashed={!marks.valid} />
      <FatLines
        positions={marks.halo}
        color={color}
        width={1.5}
        opacity={0.8}
        dashed={!marks.valid}
      />
      <HaloFill rect={marks.rect} color={color} opacity={0.1} />
    </>
  );
}

function PlacementGhost() {
  const tool = useEditor((state) => state.tool);
  const ghost = useEditor((state) => state.ghost);
  if (tool.type !== 'place' || !ghost) return null;
  return <PlacementPreview kind={tool.kind} rotation={tool.rotation} at={ghost} />;
}

function ProposalPreview({ proposal }: { readonly proposal: Proposal }) {
  const index = useEditor(selectEffectiveIndex);
  const material = useGhostMaterial(COLORS.ai, 0.42);
  const segments = useMemo(() => proposalSegments(proposal, index), [proposal, index]);
  return (
    <>
      {proposal.moves.map((move) => {
        const item = index.get(move.id);
        return item ? (
          <mesh
            key={move.id}
            geometry={kindGeometry(item.kind)}
            material={material}
            position={[move.to.x, 0, move.to.z]}
            rotation-y={yaw(move.to.rotation)}
            dispose={null}
          />
        ) : null;
      })}
      <FatLines positions={segments} color={COLORS.ai} width={2} />
    </>
  );
}

function ProposalGhosts() {
  const proposal = useEditor((state) => state.proposal);
  return proposal ? <ProposalPreview proposal={proposal} /> : null;
}

export function Ghosts() {
  return (
    <>
      <PlacementGhost />
      <ProposalGhosts />
    </>
  );
}
