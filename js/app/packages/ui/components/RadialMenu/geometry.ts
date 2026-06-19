/**
 * Pure geometry for the radial ("pie") menu. No Solid / DOM dependencies so it can
 * be unit-tested in isolation.
 *
 * Angles are **compass bearings**: degrees clockwise from North (up = 0°). Screen
 * coordinates are y-down, so a point at bearing `θ` and radius `r` from a center
 * `(cx, cy)` is `(cx + r·sin θ, cy − r·cos θ)`.
 */

export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** Slot order, clockwise from North. Index 0 = N … 7 = NW. */
export const DIRECTIONS: Direction[] = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
];

export const SLOT_COUNT = 8;
export const SLOT_ANGLE = 360 / SLOT_COUNT; // 45°

export type Ring = 'inner' | 'outer';
export type ArcDirection = 'cw' | 'ccw';

const TO_RAD = Math.PI / 180;

/** Wrap a slot index into `[0, SLOT_COUNT)`. */
export const wrapSlot = (index: number): number =>
  ((index % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;

/** Normalize an angle (degrees) into `[0, 360)`. */
export const normalizeAngle = (deg: number): number =>
  ((deg % 360) + 360) % 360;

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

export const directionToSlot = (dir: Direction): number =>
  DIRECTIONS.indexOf(dir);

export const bearingForSlot = (index: number): number =>
  wrapSlot(index) * SLOT_ANGLE;

/**
 * Bearing (degrees clockwise from North) of the vector from the menu center to a
 * point. `dx`/`dy` are `point − center` in screen coordinates (y-down).
 */
export const bearingFromCenter = (dx: number, dy: number): number =>
  normalizeAngle(Math.atan2(dx, -dy) / TO_RAD);

/**
 * Slot index (0 = N … 7 = NW) for a bearing. Each slot is centered on its
 * direction and spans ±22.5°.
 */
export const slotIndexFromBearing = (bearing: number): number =>
  wrapSlot(Math.round(normalizeAngle(bearing) / SLOT_ANGLE));

export interface RingThresholds {
  /** Radius of the central dead zone. */
  deadZone: number;
  /** Distance boundary between the inner and outer ring. */
  split: number;
}

/**
 * Which ring a distance from center falls into. Returns `null` inside the dead
 * zone. Anything beyond the outer ring clamps to `'outer'`. For a single-ring menu
 * pass `split = Infinity`.
 */
export const ringFromDistance = (
  r: number,
  { deadZone, split }: RingThresholds
): Ring | null => {
  if (r < deadZone) return null;
  if (r < split) return 'inner';
  return 'outer';
};

export interface Aim {
  ring: Ring | null;
  slotIndex: number;
}

/** Combine bearing + distance into the currently aimed `{ ring, slotIndex }`. */
export const aimFromPointer = (
  dx: number,
  dy: number,
  thresholds: RingThresholds
): Aim => ({
  ring: ringFromDistance(Math.hypot(dx, dy), thresholds),
  slotIndex: slotIndexFromBearing(bearingFromCenter(dx, dy)),
});

/**
 * Contiguous arc of directions from `from` to `to`, inclusive.
 *
 * Defaults to the **shorter** arc (e.g. `span('N', 'W') === ['N', 'NW', 'W']`).
 * Ties (exact opposites) resolve clockwise. Pass `dir` to force a direction.
 */
export const span = (
  from: Direction,
  to: Direction,
  dir?: ArcDirection
): Direction[] => {
  const fromIdx = directionToSlot(from);
  const toIdx = directionToSlot(to);
  const cwSteps = wrapSlot(toIdx - fromIdx);
  const ccwSteps = wrapSlot(fromIdx - toIdx);

  const useDir: ArcDirection = dir ?? (cwSteps <= ccwSteps ? 'cw' : 'ccw');
  const steps = useDir === 'cw' ? cwSteps : ccwSteps;

  const result: Direction[] = [];
  for (let i = 0; i <= steps; i++) {
    const idx = useDir === 'cw' ? fromIdx + i : fromIdx - i;
    result.push(DIRECTIONS[wrapSlot(idx)]);
  }
  return result;
};

export interface SlotArc {
  /** Leading edge bearing (clockwise start), may exceed 360 after end. */
  startBearing: number;
  /** Trailing edge bearing (clockwise). */
  endBearing: number;
  /** Center bearing of the arc. */
  midBearing: number;
  slotCount: number;
}

/**
 * The angular extent covered by a contiguous set of slots, expressed as a
 * clockwise arc. The input may be listed in any rotational order (e.g. the
 * `['N', 'NW', 'W']` produced by `span`).
 */
export const slotArc = (slots: Direction[]): SlotArc => {
  const set = new Set(slots.map(directionToSlot));
  const count = set.size;

  // The clockwise start is the slot whose counter-clockwise neighbor is outside
  // the set. For a full ring there is no boundary, so start at slot 0.
  let startSlot = 0;
  for (const idx of set) {
    if (!set.has(wrapSlot(idx - 1))) {
      startSlot = idx;
      break;
    }
  }

  const startBearing = startSlot * SLOT_ANGLE - SLOT_ANGLE / 2;
  const endBearing = startBearing + SLOT_ANGLE * count;
  return {
    startBearing,
    endBearing,
    midBearing: (startBearing + endBearing) / 2,
    slotCount: count,
  };
};

export interface Point {
  x: number;
  y: number;
}

/** Point on a circle at the given bearing (degrees clockwise from North). */
export const pointOnCircle = (
  cx: number,
  cy: number,
  r: number,
  bearingDeg: number
): Point => {
  const rad = bearingDeg * TO_RAD;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
};

export interface ArcPathParams {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startBearing: number;
  endBearing: number;
}

/**
 * SVG `d` string for an annular sector (a ring "wedge") between `innerR` and
 * `outerR`, swept clockwise from `startBearing` to `endBearing`.
 */
export const arcPath = ({
  cx,
  cy,
  innerR,
  outerR,
  startBearing,
  endBearing,
}: ArcPathParams): string => {
  const sweep = endBearing - startBearing;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  // Bearing increases clockwise on screen, which is SVG's positive (sweep=1).
  const sweepFlag = sweep >= 0 ? 1 : 0;

  const oStart = pointOnCircle(cx, cy, outerR, startBearing);
  const oEnd = pointOnCircle(cx, cy, outerR, endBearing);
  const iEnd = pointOnCircle(cx, cy, innerR, endBearing);
  const iStart = pointOnCircle(cx, cy, innerR, startBearing);

  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} ${sweepFlag} ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} ${sweepFlag === 1 ? 0 : 1} ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
};

export interface RadialGeometryConfig {
  deadZoneRadius: number;
  ringThickness: number;
  ringGap: number;
  twoRings: boolean;
}

export interface RingBand {
  innerR: number;
  outerR: number;
  midR: number;
}

export interface RadialGeometry {
  deadZoneRadius: number;
  inner: RingBand;
  outer: RingBand | null;
  /** Distance boundary between inner and outer ring (Infinity if single ring). */
  split: number;
  /** Overall outer radius of the menu. */
  outerRadius: number;
}

const band = (innerR: number, outerR: number): RingBand => ({
  innerR,
  outerR,
  midR: (innerR + outerR) / 2,
});

/** Compute the radii bands for one or two rings from a config. */
export const computeRadialGeometry = ({
  deadZoneRadius,
  ringThickness,
  ringGap,
  twoRings,
}: RadialGeometryConfig): RadialGeometry => {
  const inner = band(
    deadZoneRadius + ringGap,
    deadZoneRadius + ringGap + ringThickness
  );

  if (!twoRings) {
    return {
      deadZoneRadius,
      inner,
      outer: null,
      split: Number.POSITIVE_INFINITY,
      outerRadius: inner.outerR,
    };
  }

  const outer = band(
    inner.outerR + ringGap,
    inner.outerR + ringGap + ringThickness
  );
  return {
    deadZoneRadius,
    inner,
    outer,
    split: (inner.outerR + outer.innerR) / 2,
    outerRadius: outer.outerR,
  };
};

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Top-left position for a `size × size` menu centered on `(cursorX, cursorY)`,
 * slid as needed so it stays fully within the viewport (with `margin` padding).
 * The menu's effective center may therefore differ from the cursor — aiming is
 * computed from the menu center, not the cursor.
 */
export const clampMenuPosition = (
  cursorX: number,
  cursorY: number,
  size: number,
  viewport: Viewport,
  margin: number
): { left: number; top: number } => {
  const maxLeft = Math.max(margin, viewport.width - size - margin);
  const maxTop = Math.max(margin, viewport.height - size - margin);
  return {
    left: clamp(cursorX - size / 2, margin, maxLeft),
    top: clamp(cursorY - size / 2, margin, maxTop),
  };
};
