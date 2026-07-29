import { describe, expect, it } from 'vitest';
import {
  aimFromPointer,
  arcPath,
  bearingFromCenter,
  clampMenuPosition,
  computeRadialGeometry,
  ringFromDistance,
  slotArc,
  slotIndexFromBearing,
  span,
} from './geometry';

const SINGLE_RING = { deadZone: 32, split: Number.POSITIVE_INFINITY };
const TWO_RING = { deadZone: 32, split: 100 };

/** Pull the [largeArc, sweep] flags from the first SVG arc command. */
const firstArcFlags = (d: string): [string, string] => {
  const tokens = d.split(' ');
  const a = tokens.indexOf('A');
  return [tokens[a + 4], tokens[a + 5]];
};

describe('bearingFromCenter + slotIndexFromBearing', () => {
  // dx, dy are point − center in screen coords (y grows downward).
  const cases: [string, number, number, number][] = [
    ['N (up)', 0, -10, 0],
    ['NE (up-right)', 10, -10, 1],
    ['E (right)', 10, 0, 2],
    ['SE (down-right)', 10, 10, 3],
    ['S (down)', 0, 10, 4],
    ['SW (down-left)', -10, 10, 5],
    ['W (left)', -10, 0, 6],
    ['NW (up-left)', -10, -10, 7],
  ];

  for (const [name, dx, dy, slot] of cases) {
    it(`maps ${name} to slot ${slot}`, () => {
      expect(slotIndexFromBearing(bearingFromCenter(dx, dy))).toBe(slot);
    });
  }

  it('snaps at the ±22.5° slot boundary', () => {
    expect(slotIndexFromBearing(22.4)).toBe(0); // still N
    expect(slotIndexFromBearing(22.6)).toBe(1); // now NE
  });

  it('wraps angles past 360 back to N', () => {
    expect(slotIndexFromBearing(359)).toBe(0);
    expect(bearingFromCenter(-1, -100)).toBeGreaterThan(350);
  });
});

describe('ringFromDistance', () => {
  it('returns null inside the dead zone', () => {
    expect(ringFromDistance(10, TWO_RING)).toBeNull();
    expect(ringFromDistance(31.9, TWO_RING)).toBeNull();
  });

  it('splits inner vs outer by distance', () => {
    expect(ringFromDistance(50, TWO_RING)).toBe('inner');
    expect(ringFromDistance(99, TWO_RING)).toBe('inner');
    expect(ringFromDistance(120, TWO_RING)).toBe('outer');
  });

  it('keeps everything on the inner ring when single-ring', () => {
    expect(ringFromDistance(50, SINGLE_RING)).toBe('inner');
    expect(ringFromDistance(99999, SINGLE_RING)).toBe('inner');
  });
});

describe('span', () => {
  it('takes the shorter arc by default (N to W = 3 slots)', () => {
    expect(span('N', 'W')).toEqual(['N', 'NW', 'W']);
  });

  it('honors an explicit clockwise direction', () => {
    expect(span('N', 'W', 'cw')).toEqual([
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
    ]);
  });

  it('resolves exact opposites clockwise', () => {
    expect(span('N', 'S')).toEqual(['N', 'NE', 'E', 'SE', 'S']);
  });

  it('handles a single slot and a wrap-around arc', () => {
    expect(span('E', 'E')).toEqual(['E']);
    expect(span('W', 'N')).toEqual(['W', 'NW', 'N']);
  });
});

describe('slotArc', () => {
  it('describes a single slot centered on its direction', () => {
    const arc = slotArc(['N']);
    expect(arc).toMatchObject({
      startBearing: -22.5,
      endBearing: 22.5,
      midBearing: 0,
      slotCount: 1,
    });
  });

  it('centers a spanning arc on its middle slot regardless of list order', () => {
    const arc = slotArc(span('N', 'W')); // ['N', 'NW', 'W']
    expect(arc.midBearing).toBe(315); // NW
    expect(arc.slotCount).toBe(3);
    expect(arc.endBearing - arc.startBearing).toBe(135);
  });

  it('finds the clockwise start for a contiguous middle arc', () => {
    const arc = slotArc(['NE', 'E', 'SE']); // slots 1,2,3
    expect(arc.startBearing).toBe(22.5);
    expect(arc.midBearing).toBe(90); // E
  });
});

describe('arcPath', () => {
  const base = { cx: 100, cy: 100, innerR: 40, outerR: 80 };

  it('produces a closed two-arc annular sector', () => {
    const d = arcPath({ ...base, startBearing: -22.5, endBearing: 22.5 });
    expect(d.startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d.match(/A/g)).toHaveLength(2);
  });

  it('sets large-arc=0 and clockwise sweep for a 45° wedge', () => {
    const d = arcPath({ ...base, startBearing: 0, endBearing: 45 });
    expect(firstArcFlags(d)).toEqual(['0', '1']);
  });

  it('sets large-arc=1 for a wedge wider than 180°', () => {
    const d = arcPath({ ...base, startBearing: 0, endBearing: 315 });
    expect(firstArcFlags(d)).toEqual(['1', '1']);
  });
});

describe('computeRadialGeometry', () => {
  const base = { deadZoneRadius: 40, radius: 120, ringGap: 24 };

  it('keeps single-ring labels on the boundary (no gap to apply)', () => {
    const g = computeRadialGeometry({
      ...base,
      hasInner: false,
      hasOuter: true,
    });
    expect(g.radius).toBe(120);
    expect(g.innerLabelRadius).toBe(120);
    expect(g.outerLabelRadius).toBe(120);
    expect(g.outerRadius).toBe(120);
  });

  it('splits the gap to either side of the boundary for two rings', () => {
    const g = computeRadialGeometry({
      ...base,
      hasInner: true,
      hasOuter: true,
    });
    expect(g.split).toBe(120); // aim boundary stays at radius
    expect(g.innerLabelRadius).toBe(108); // radius − ringGap/2
    expect(g.outerLabelRadius).toBe(132); // radius + ringGap/2
    expect(g.outerRadius).toBe(132); // wrapper reaches the outer labels
  });

  it('routes everything past the dead zone to the outer ring when outer-only', () => {
    const g = computeRadialGeometry({
      ...base,
      hasInner: false,
      hasOuter: true,
    });
    expect(g.split).toBe(40); // = deadZoneRadius → always outer
  });

  it('routes everything to the inner ring when inner-only', () => {
    const g = computeRadialGeometry({
      ...base,
      hasInner: true,
      hasOuter: false,
    });
    expect(g.split).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('clampMenuPosition', () => {
  const viewport = { width: 1000, height: 800 };
  const size = 200;
  const margin = 8;

  it('centers on the cursor when there is room', () => {
    expect(clampMenuPosition(500, 400, size, viewport, margin)).toEqual({
      left: 400,
      top: 300,
    });
  });

  it('slides away from the top-left corner', () => {
    expect(clampMenuPosition(10, 10, size, viewport, margin)).toEqual({
      left: 8,
      top: 8,
    });
  });

  it('slides away from the bottom-right corner', () => {
    expect(clampMenuPosition(995, 795, size, viewport, margin)).toEqual({
      left: 792, // 1000 - 200 - 8
      top: 592, // 800 - 200 - 8
    });
  });
});

describe('aimFromPointer', () => {
  it('reports the dead zone when close to center', () => {
    expect(aimFromPointer(0, -10, SINGLE_RING).ring).toBeNull();
  });

  it('combines ring + slot for a clear aim', () => {
    expect(aimFromPointer(0, -100, SINGLE_RING)).toEqual({
      ring: 'inner',
      slotIndex: 0,
    });
    expect(aimFromPointer(120, 0, TWO_RING)).toEqual({
      ring: 'outer',
      slotIndex: 2, // E
    });
  });
});
