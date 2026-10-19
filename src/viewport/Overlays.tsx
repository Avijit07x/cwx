import { useMemo } from 'react';
import { itemRect } from '../domain/grid';
import type { PlacedItem } from '../domain/types';
import { selectEffectiveIndex, selectViolations, useSelectedItem } from '../state/selectors';
import { useEditor } from '../state/store';
import { FatLines, HaloFill } from './FatLines';
import { haloSegments, hoverSegments, selectionSegments, violationSegments } from './segments';
import { COLORS, useAccentColor } from './colors';

function ViolationMarks() {
  const violations = useEditor(selectViolations);
  const index = useEditor(selectEffectiveIndex);
  const segments = useMemo(() => violationSegments(violations, index), [violations, index]);
  if (violations.length === 0) return null;
  return (
    <>
      <FatLines positions={segments.outlines} color={COLORS.danger} width={1.5} />
      <FatLines positions={segments.connectors} color={COLORS.danger} width={2.5} />
    </>
  );
}

function HoverMark() {
  const item = useEditor((state) =>
    state.hoveredId === null ||
    state.hoveredId === state.selectedId ||
    state.drag !== null ||
    state.tool.type === 'place'
      ? undefined
      : selectEffectiveIndex(state).get(state.hoveredId),
  );
  const positions = useMemo(() => (item ? hoverSegments(item) : null), [item]);
  if (!positions) return null;
  return <FatLines positions={positions} color={COLORS.hover} width={1.5} opacity={0.85} />;
}

interface SelectionMarksProps {
  readonly item: PlacedItem;
  readonly color: string;
}

function SelectionMarks({ item, color }: SelectionMarksProps) {
  const rect = useMemo(() => itemRect(item), [item]);
  const edges = useMemo(() => selectionSegments(item), [item]);
  const halo = useMemo(() => new Float32Array(haloSegments(rect)), [rect]);
  return (
    <>
      <FatLines positions={edges} color={color} width={2} />
      <FatLines positions={halo} color={color} width={1.5} opacity={0.75} />
      <HaloFill rect={rect} color={color} />
    </>
  );
}

function Selection({ color }: { readonly color: string }) {
  const item = useSelectedItem();
  return item ? <SelectionMarks item={item} color={color} /> : null;
}

export function Overlays() {
  const accent = useAccentColor();
  return (
    <>
      <ViolationMarks />
      <HoverMark />
      <Selection color={accent} />
    </>
  );
}
