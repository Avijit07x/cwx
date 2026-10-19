import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Proposal } from '../domain/proposal';
import { findViolations, MIN_CLEARANCE, rectGap } from '../domain/rules';
import type { PlacedItem, Point, Rect } from '../domain/types';
import { beginDrag, select, updateDrag } from '../state/actions';
import { selectEffectiveIndex, selectViolations } from '../state/selectors';
import { resetEditor, useEditor } from '../state/store';
import { makeItem } from '../test/fixtures';
import {
  boxEdgeSegments,
  closestPoints,
  haloFillGeometry,
  haloSegments,
  OVERLAY_Y,
  placementMarks,
  proposalSegments,
  roundedRectPoints,
  selectionSegments,
  violationSegments,
} from './segments';

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): Rect => ({
  minX,
  minZ,
  maxX,
  maxZ,
});

const indexOf = (items: readonly PlacedItem[]) => new Map(items.map((item) => [item.id, item]));

function distanceToRect(point: Point, area: Rect): number {
  const dx = Math.max(area.minX - point.x, 0, point.x - area.maxX);
  const dz = Math.max(area.minZ - point.z, 0, point.z - area.maxZ);
  return Math.hypot(dx, dz);
}

describe('closestPoints', () => {
  it('joins the facing edges of neighbours side by side', () => {
    expect(closestPoints(rect(0, 0, 1, 1), rect(1.5, 0.5, 2.5, 1.5))).toEqual([
      { x: 1, z: 0.75 },
      { x: 1.5, z: 0.75 },
    ]);
  });

  it('joins the nearest corners of diagonal neighbours', () => {
    expect(closestPoints(rect(0, 0, 1, 1), rect(1.4, 1.3, 2, 2))).toEqual([
      { x: 1, z: 1 },
      { x: 1.4, z: 1.3 },
    ]);
  });

  it('measures the same gap as the clearance rule', () => {
    const pairs: readonly (readonly [Rect, Rect])[] = [
      [rect(0, 0, 1, 0.5), rect(1.25, 0.75, 2.75, 1.75)],
      [rect(3, 3, 4, 4), rect(1, 3.5, 2.5, 5)],
      [rect(2, 2, 3, 3), rect(2.5, 3.4, 3.5, 4)],
    ];
    for (const [a, b] of pairs) {
      const [p, q] = closestPoints(a, b);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(rectGap(a, b).gap, 9);
    }
  });
});

describe('violationSegments', () => {
  it('outlines every violating item once and connects each separated pair', () => {
    const hub = makeItem({ kind: 'drive', x: 2.25, z: 2.25 });
    const east = makeItem({ kind: 'drive', x: 3.25, z: 2.25 });
    const south = makeItem({ kind: 'drive', x: 2.25, z: 3.25 });
    const clear = makeItem({ kind: 'drive', x: 10.25, z: 8.25 });
    const items = [hub, east, south, clear];
    const { outlines, connectors } = violationSegments(findViolations(items), indexOf(items));
    expect(outlines).toHaveLength(3 * 4 * 6);
    expect(connectors).toHaveLength(2 * 6);
    expect(Array.from(connectors).filter((_, index) => index % 3 === 1)).toEqual(
      Array.from({ length: 4 }, () => Math.fround(OVERLAY_Y.connector)),
    );
  });

  it('draws no connector for overlapping items', () => {
    const a = makeItem({ kind: 'cabinet', x: 5, z: 5.25 });
    const b = makeItem({ kind: 'cabinet', x: 5.5, z: 5.25 });
    const { outlines, connectors } = violationSegments(findViolations([a, b]), indexOf([a, b]));
    expect(outlines).toHaveLength(2 * 4 * 6);
    expect(connectors).toHaveLength(0);
  });
});

describe('clearance halo', () => {
  const footprint = rect(4, 2, 5, 2.5);

  it('stays exactly the minimum clearance away from the footprint', () => {
    const points = roundedRectPoints(footprint, MIN_CLEARANCE);
    expect(points.length).toBeGreaterThan(8);
    for (const point of points)
      expect(distanceToRect(point, footprint)).toBeCloseTo(MIN_CLEARANCE, 9);
  });

  it('closes the loop on the floor', () => {
    const segments = haloSegments(footprint);
    expect(segments.slice(-3)).toEqual(segments.slice(0, 3));
    expect(segments.filter((_, index) => index % 3 === 1).every((y) => y === OVERLAY_Y.halo)).toBe(
      true,
    );
  });

  it('fills the halo area facing up, so a one-sided material draws it from above', () => {
    const geometry = haloFillGeometry(footprint);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const corners = Array.from(geometry.getIndex()?.array ?? [], (vertex) =>
      new Vector3().fromBufferAttribute(position, vertex),
    );
    for (let vertex = 0; vertex < normal.count; vertex++) expect(normal.getY(vertex)).toBe(1);
    for (let corner = 0; corner < corners.length; corner += 3) {
      const [a, b, c] = corners.slice(corner, corner + 3);
      if (!a || !b || !c) throw new Error('The fill has an incomplete triangle');
      expect(new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).y).toBeGreaterThan(0);
    }
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.toArray()).toEqual([
      expect.closeTo(footprint.minX - MIN_CLEARANCE),
      expect.closeTo(OVERLAY_Y.fill),
      expect.closeTo(footprint.minZ - MIN_CLEARANCE),
    ]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([
      expect.closeTo(footprint.maxX + MIN_CLEARANCE),
      expect.closeTo(OVERLAY_Y.fill),
      expect.closeTo(footprint.maxZ + MIN_CLEARANCE),
    ]);
    geometry.dispose();
  });
});

describe('boxEdgeSegments', () => {
  it('draws the twelve edges of the item box, just outside it', () => {
    const segments = boxEdgeSegments(rect(0, 0, 1, 0.5), 2, 0.02);
    expect(segments).toHaveLength(12 * 6);
    const ys = segments.filter((_, index) => index % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(2.02);
    const xs = segments.filter((_, index) => index % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-0.02);
  });
});

describe('placementMarks', () => {
  const neighbour = makeItem({ kind: 'cabinet', x: 5, z: 5.25 });

  it('is valid when the spot keeps the clearance from every item', () => {
    const marks = placementMarks('drive', 0, { x: 6.25, z: 5.25 }, [{ ...neighbour, x: 4.5 }]);
    expect(marks.valid).toBe(true);
    expect(marks.rect).toEqual(rect(6, 5, 6.5, 5.5));
    expect(marks.outline).toHaveLength(4 * 6);
  });

  it('is invalid and points at the item it would crowd', () => {
    const marks = placementMarks('drive', 0, { x: 6.25, z: 5.25 }, [neighbour]);
    expect(marks.valid).toBe(false);
    expect(Array.from(marks.outline.slice(-6))).toEqual(
      [6, OVERLAY_Y.connector, 5.25, 5.5, OVERLAY_Y.connector, 5.25].map(Math.fround),
    );
  });

  it('counts touching items as too close, without a zero-length connector', () => {
    const marks = placementMarks('drive', 0, { x: 5.75, z: 5.25 }, [neighbour]);
    expect(marks.valid).toBe(false);
    expect(marks.outline).toHaveLength(4 * 6);
  });
});

describe('proposalSegments', () => {
  it('outlines the original and target positions and draws an arrow between them', () => {
    const item = makeItem({ kind: 'drive', tag: 'VFD-04', x: 7.75, z: 3.75 });
    const proposal: Proposal = {
      id: 'p1',
      violationsBefore: 1,
      violationsAfter: 0,
      moves: [
        {
          id: item.id,
          tag: item.tag,
          from: { x: 7.75, z: 3.75, rotation: 0 },
          to: { x: 9.25, z: 3.75, rotation: 0 },
        },
      ],
    };
    const segments = proposalSegments(proposal, indexOf([item]));
    expect(segments).toHaveLength(2 * 4 * 6 + 3 * 6);
    expect(Array.from(segments.slice(48, 54))).toEqual(
      [7.75, OVERLAY_Y.proposal, 3.75, 9.25, OVERLAY_Y.proposal, 3.75].map(Math.fround),
    );
  });

  it('skips moves for items that no longer exist', () => {
    const gone = makeItem();
    const proposal: Proposal = {
      id: 'p2',
      violationsBefore: 1,
      violationsAfter: 0,
      moves: [
        {
          id: gone.id,
          tag: gone.tag,
          from: { x: gone.x, z: gone.z, rotation: gone.rotation },
          to: { x: 3.25, z: gone.z, rotation: gone.rotation },
        },
      ],
    };
    expect(proposalSegments(proposal, new Map())).toHaveLength(0);
  });
});

describe('overlays during a drag', () => {
  it('follow the live drag preview before anything is committed', () => {
    const moving = makeItem({ kind: 'drive', tag: 'VFD-01', x: 2.25, z: 2.25 });
    const fixed = makeItem({ kind: 'drive', tag: 'VFD-02', x: 8.25, z: 2.25 });
    resetEditor([moving, fixed]);
    select(moving.id);
    const before = useEditor.getState();
    expect(
      violationSegments(selectViolations(before), selectEffectiveIndex(before)).outlines,
    ).toHaveLength(0);

    beginDrag(moving.id);
    updateDrag({ x: 7.25, z: 2.25 });
    const during = useEditor.getState();
    const preview = selectEffectiveIndex(during).get(moving.id);
    expect(preview).toMatchObject({ x: 7.25, z: 2.25 });
    if (!preview) return;
    const xs = Array.from(selectionSegments(preview)).filter((_, index) => index % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(6.98, 5);
    const live = violationSegments(selectViolations(during), selectEffectiveIndex(during));
    expect(live.outlines).toHaveLength(2 * 4 * 6);
    expect(live.connectors).toHaveLength(6);
    expect(during.items.find((item) => item.id === moving.id)).toMatchObject({ x: 2.25 });
  });
});
