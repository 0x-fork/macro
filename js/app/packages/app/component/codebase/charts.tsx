import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Index,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import type { WeeklyPrActivity } from './model';

/**
 * Dependency-free SVG charts for the codebase view, styled after Linear's
 * dashboards: smooth Catmull-Rom curves, gradient area fades, dashed hairline
 * gridlines, hatched in-progress regions, and generous negative space. Colors
 * come from the app's semantic theme tokens so identity (legend + labels,
 * never color alone) and dark mode hold up.
 */

const CHART_HEIGHT = 216;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 40 };
const MAX_BAR_WIDTH = 20;

const OPENED_COLOR = 'var(--color-ink-extra-muted)';
const MERGED_COLOR = 'var(--color-accent)';
const POSITIVE_COLOR = 'var(--color-success)';
const NEGATIVE_COLOR = 'var(--color-failure)';

const COMPACT_FORMAT = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function useElementWidth(): [(el: HTMLElement) => void, () => number] {
  const [width, setWidth] = createSignal(0);

  const ref = (el: HTMLElement) => {
    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  };

  return [ref, width];
}

/** Round the axis max up to a clean 1/2/5×10ⁿ step so ticks read cleanly. */
function niceMax(value: number): number {
  if (value <= 4) return Math.max(2, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

type Point = { x: number; y: number };

/**
 * Smooth cubic path through points (Catmull-Rom converted to bezier control
 * points) — the soft interpolation Linear's charts use.
 */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Close a smooth line down to the baseline for a gradient area fill. */
function smoothAreaPath(points: Point[], baseY: number): string {
  if (points.length === 0) return '';
  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

/** Column with a rounded data-end and a square baseline. */
function columnPath(x: number, y: number, width: number, height: number) {
  const radius = Math.min(4, height, width / 2);
  const baseY = y + height;
  return [
    `M ${x} ${baseY}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + width - radius} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + radius}`,
    `L ${x + width} ${baseY}`,
    'Z',
  ].join(' ');
}

/** Deterministic pseudo-random in [-1, 1] so beeswarm dots don't re-shuffle. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2;
}

function DashedGrid(props: {
  ticks: number[];
  yFor: (value: number) => number;
  x1: number;
  x2: number;
  format?: (value: number) => string;
}) {
  return (
    <For each={props.ticks}>
      {(tick) => (
        <>
          <line
            x1={props.x1}
            x2={props.x2}
            y1={props.yFor(tick)}
            y2={props.yFor(tick)}
            stroke="var(--color-edge-muted)"
            stroke-width={1}
            stroke-dasharray="2 5"
          />
          <text
            x={props.x1 - 8}
            y={props.yFor(tick) + 3}
            text-anchor="end"
            class="fill-ink-extra-muted/80 text-[10px] tabular-nums"
          >
            {(props.format ?? String)(tick)}
          </text>
        </>
      )}
    </For>
  );
}

function XLabels(props: {
  labels: string[];
  centerFor: (index: number) => number;
  every: number;
  height?: number;
}) {
  return (
    <Index each={props.labels}>
      {(label, index) => (
        <Show when={index % props.every === 0}>
          <text
            x={props.centerFor(index)}
            y={(props.height ?? CHART_HEIGHT) - 8}
            text-anchor="middle"
            class="fill-ink-extra-muted/80 text-[10px]"
          >
            {label()}
          </text>
        </Show>
      )}
    </Index>
  );
}

function Crosshair(props: { x: number; height?: number }) {
  return (
    <line
      x1={props.x}
      x2={props.x}
      y1={MARGIN.top}
      y2={(props.height ?? CHART_HEIGHT) - MARGIN.bottom}
      stroke="var(--color-ink-extra-muted)"
      stroke-width={1}
      stroke-dasharray="2 4"
      opacity={0.7}
    />
  );
}

function ChartTooltip(props: {
  x: number;
  chartWidth: number;
  children: JSX.Element;
}) {
  return (
    <div
      class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-menu px-3 py-2 text-xs shadow-menu ring ring-edge-muted"
      style={{
        left: `${Math.min(Math.max(props.x, 72), props.chartWidth - 72)}px`,
        top: '-6px',
      }}
    >
      {props.children}
    </div>
  );
}

function TooltipRow(props: {
  color?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div class="flex items-center gap-1.5 text-ink-muted tabular-nums">
      <Show when={props.color}>
        <span
          class="size-1.5 rounded-full"
          style={{ 'background-color': props.color }}
        />
      </Show>
      <span>{props.label}</span>
      <span class="ml-auto pl-3 text-ink">{props.value}</span>
    </div>
  );
}

export function LegendSwatch(props: {
  color: string;
  label: string;
  shape?: 'dot' | 'line';
}) {
  return (
    <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
      <Show
        when={props.shape === 'line'}
        fallback={
          <span
            class="size-2 rounded-full"
            style={{ 'background-color': props.color }}
          />
        }
      >
        <span
          class="h-0.5 w-3 rounded-full"
          style={{ 'background-color': props.color }}
        />
      </Show>
      {props.label}
    </span>
  );
}

type ThroughputChartProps = {
  data: WeeklyPrActivity[];
};

/**
 * Burn-up style throughput: cumulative opened (muted line) vs cumulative
 * merged (accent line over a gradient area), weekly merged volume as soft
 * columns at the baseline, and a hatched band over the in-progress week.
 */
export function ThroughputChart(props: ThroughputChartProps) {
  const uid = createUniqueId();
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const cumulative = createMemo(() => {
    let opened = 0;
    let merged = 0;
    return props.data.map((week) => {
      opened += week.opened;
      merged += week.merged;
      return { ...week, cumOpened: opened, cumMerged: merged };
    });
  });

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const data = cumulative();
    const bandWidth = data.length ? innerWidth / data.length : innerWidth;
    const max = niceMax(
      Math.max(1, ...data.map((d) => Math.max(d.cumOpened, d.cumMerged)))
    );
    const weeklyMax = Math.max(1, ...data.map((d) => d.merged));
    const yFor = (value: number) =>
      MARGIN.top + innerHeight * (1 - value / max);
    const xFor = (index: number) =>
      MARGIN.left + index * bandWidth + bandWidth / 2;
    // Weekly columns live in the bottom quarter on their own scale.
    const barFor = (value: number) => (value / weeklyMax) * innerHeight * 0.24;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      max,
      yFor,
      xFor,
      barFor,
      baseY: MARGIN.top + innerHeight,
      ticks: [0, max / 2, max].filter((t) => Number.isInteger(t) || t === max),
      labelEvery: bandWidth >= 34 ? 1 : 2,
    };
  });

  const openedPoints = createMemo(() =>
    cumulative().map((d, i) => ({
      x: layout().xFor(i),
      y: layout().yFor(d.cumOpened),
    }))
  );
  const mergedPoints = createMemo(() =>
    cumulative().map((d, i) => ({
      x: layout().xFor(i),
      y: layout().yFor(d.cumMerged),
    }))
  );

  const lastIndex = () => cumulative().length - 1;

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0 && cumulative().length > 0}>
        <svg
          role="img"
          aria-label="Cumulative pull requests opened and merged, with weekly merged volume"
          width={layout().chartWidth}
          height={CHART_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          <defs>
            <linearGradient id={`tp-area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={MERGED_COLOR} stop-opacity="0.22" />
              <stop offset="100%" stop-color={MERGED_COLOR} stop-opacity="0" />
            </linearGradient>
            <linearGradient id={`tp-bar-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={MERGED_COLOR} stop-opacity="0.5" />
              <stop
                offset="100%"
                stop-color={MERGED_COLOR}
                stop-opacity="0.15"
              />
            </linearGradient>
            <pattern
              id={`tp-hatch-${uid}`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="5"
                stroke="var(--color-ink)"
                stroke-width="1"
                opacity="0.08"
              />
            </pattern>
          </defs>

          <DashedGrid
            ticks={layout().ticks}
            yFor={layout().yFor}
            x1={MARGIN.left}
            x2={layout().chartWidth - MARGIN.right}
            format={(v) => COMPACT_FORMAT.format(v)}
          />

          {/* In-progress (current, partial) week */}
          <rect
            x={MARGIN.left + lastIndex() * layout().bandWidth}
            y={MARGIN.top}
            width={layout().bandWidth}
            height={layout().innerHeight}
            fill={`url(#tp-hatch-${uid})`}
          />

          {/* Weekly merged volume */}
          <Index each={cumulative()}>
            {(week, index) => (
              <Show when={week().merged > 0}>
                <path
                  d={columnPath(
                    layout().xFor(index) -
                      Math.min(10, layout().bandWidth * 0.25),
                    layout().baseY - layout().barFor(week().merged),
                    Math.min(10, layout().bandWidth * 0.25) * 2,
                    layout().barFor(week().merged)
                  )}
                  fill={`url(#tp-bar-${uid})`}
                />
              </Show>
            )}
          </Index>

          {/* Cumulative merged: gradient area + line */}
          <path
            d={smoothAreaPath(mergedPoints(), layout().baseY)}
            fill={`url(#tp-area-${uid})`}
          />
          <path
            d={smoothPath(mergedPoints())}
            fill="none"
            stroke={MERGED_COLOR}
            stroke-width={2}
            stroke-linecap="round"
          />

          {/* Cumulative opened: muted context line */}
          <path
            d={smoothPath(openedPoints())}
            fill="none"
            stroke={OPENED_COLOR}
            stroke-width={1.5}
            stroke-linecap="round"
            opacity={0.9}
          />

          {/* End dots */}
          <Show when={openedPoints().length > 0}>
            <circle
              cx={openedPoints()[lastIndex()].x}
              cy={openedPoints()[lastIndex()].y}
              r={3.5}
              fill={OPENED_COLOR}
              stroke="var(--color-surface)"
              stroke-width={2}
            />
            <circle
              cx={mergedPoints()[lastIndex()].x}
              cy={mergedPoints()[lastIndex()].y}
              r={3.5}
              fill={MERGED_COLOR}
              stroke="var(--color-surface)"
              stroke-width={2}
            />
          </Show>

          <Show when={hovered() !== undefined}>
            <Crosshair x={layout().xFor(hovered() ?? 0)} />
          </Show>

          <XLabels
            labels={cumulative().map((d) => d.label)}
            centerFor={layout().xFor}
            every={layout().labelEvery}
          />

          <Index each={cumulative()}>
            {(_, index) => (
              <rect
                x={MARGIN.left + index * layout().bandWidth}
                y={MARGIN.top}
                width={layout().bandWidth}
                height={layout().innerHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
              />
            )}
          </Index>
        </svg>

        <Show when={hovered() !== undefined && cumulative()[hovered() ?? 0]}>
          {(week) => (
            <ChartTooltip
              x={layout().xFor(hovered() ?? 0)}
              chartWidth={layout().chartWidth}
            >
              <div class="mb-1 font-medium text-ink">
                Week of {week().label}
                <Show when={hovered() === lastIndex()}>
                  <span class="text-ink-extra-muted"> · in progress</span>
                </Show>
              </div>
              <TooltipRow
                color={MERGED_COLOR}
                label="Merged"
                value={`${week().merged} · ${week().cumMerged} total`}
              />
              <TooltipRow
                color={OPENED_COLOR}
                label="Opened"
                value={`${week().opened} · ${week().cumOpened} total`}
              />
            </ChartTooltip>
          )}
        </Show>
      </Show>
    </div>
  );
}

export function ThroughputLegend() {
  return (
    <div class="flex items-center gap-3">
      <LegendSwatch color={MERGED_COLOR} label="Merged" shape="line" />
      <LegendSwatch color={OPENED_COLOR} label="Opened" shape="line" />
    </div>
  );
}

export type TrendPoint = {
  label: string;
  /** undefined = no data this period (gap, not zero). */
  value: number | undefined;
  /** Optional context shown in the tooltip (e.g. "3 merged"). */
  detail?: string;
};

type TrendLineChartProps = {
  data: TrendPoint[];
  /** Unit suffix for tick + tooltip values (e.g. "d"). */
  unit?: string;
  ariaLabel: string;
  color?: string;
};

function formatTrendValue(value: number, unit?: string) {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit ?? ''}`;
}

/**
 * Single-series smooth trend line over a gradient wash, with gaps where a
 * period has no data. One series → the title names it, no legend box.
 */
export function TrendLineChart(props: TrendLineChartProps) {
  const uid = createUniqueId();
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();
  const color = () => props.color ?? 'var(--color-accent)';

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.data.length
      ? innerWidth / props.data.length
      : innerWidth;
    const max = niceMax(Math.max(1, ...props.data.map((d) => d.value ?? 0)));
    const yFor = (value: number) =>
      MARGIN.top + innerHeight * (1 - value / max);
    const xFor = (index: number) =>
      MARGIN.left + index * bandWidth + bandWidth / 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      max,
      yFor,
      xFor,
      baseY: MARGIN.top + innerHeight,
      ticks: [0, max / 2, max].filter((t) => Number.isInteger(t) || t === max),
      labelEvery: bandWidth >= 34 ? 1 : 2,
    };
  });

  // Contiguous segments across gaps.
  const segments = createMemo(() => {
    const result: Point[][] = [];
    let current: Point[] = [];
    props.data.forEach((point, index) => {
      if (point.value === undefined) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push({ x: layout().xFor(index), y: layout().yFor(point.value) });
    });
    if (current.length) result.push(current);
    return result;
  });

  const lastDefined = createMemo(() => {
    for (let i = props.data.length - 1; i >= 0; i--) {
      const value = props.data[i].value;
      if (value !== undefined) return { index: i, value };
    }
    return undefined;
  });

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0}>
        <svg
          role="img"
          aria-label={props.ariaLabel}
          width={layout().chartWidth}
          height={CHART_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          <defs>
            <linearGradient
              id={`trend-area-${uid}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stop-color={color()} stop-opacity="0.18" />
              <stop offset="100%" stop-color={color()} stop-opacity="0" />
            </linearGradient>
          </defs>

          <DashedGrid
            ticks={layout().ticks}
            yFor={layout().yFor}
            x1={MARGIN.left}
            x2={layout().chartWidth - MARGIN.right}
            format={(v) => formatTrendValue(v, props.unit)}
          />

          <For each={segments()}>
            {(segment) => (
              <>
                <Show when={segment.length > 1}>
                  <path
                    d={smoothAreaPath(segment, layout().baseY)}
                    fill={`url(#trend-area-${uid})`}
                  />
                </Show>
                <path
                  d={smoothPath(segment)}
                  fill="none"
                  stroke={color()}
                  stroke-width={2}
                  stroke-linecap="round"
                />
                <Show when={segment.length === 1}>
                  <circle
                    cx={segment[0].x}
                    cy={segment[0].y}
                    r={3}
                    fill={color()}
                  />
                </Show>
              </>
            )}
          </For>

          {/* Always-on end dot with a direct value label */}
          <Show when={lastDefined()}>
            {(last) => (
              <>
                <circle
                  cx={layout().xFor(last().index)}
                  cy={layout().yFor(last().value)}
                  r={3.5}
                  fill={color()}
                  stroke="var(--color-surface)"
                  stroke-width={2}
                />
                <text
                  x={layout().xFor(last().index)}
                  y={layout().yFor(last().value) - 10}
                  text-anchor="middle"
                  class="fill-ink-muted text-[10px] font-medium tabular-nums"
                >
                  {formatTrendValue(last().value, props.unit)}
                </text>
              </>
            )}
          </Show>

          <Show
            when={
              hovered() !== undefined &&
              props.data[hovered() ?? 0]?.value !== undefined
            }
          >
            <Crosshair x={layout().xFor(hovered() ?? 0)} />
            <circle
              cx={layout().xFor(hovered() ?? 0)}
              cy={layout().yFor(props.data[hovered() ?? 0].value ?? 0)}
              r={3.5}
              fill={color()}
              stroke="var(--color-surface)"
              stroke-width={2}
            />
          </Show>

          <XLabels
            labels={props.data.map((d) => d.label)}
            centerFor={layout().xFor}
            every={layout().labelEvery}
          />

          <Index each={props.data}>
            {(_, index) => (
              <rect
                x={MARGIN.left + index * layout().bandWidth}
                y={MARGIN.top}
                width={layout().bandWidth}
                height={layout().innerHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
              />
            )}
          </Index>
        </svg>

        <Show when={hovered() !== undefined && props.data[hovered() ?? 0]}>
          {(point) => (
            <ChartTooltip
              x={layout().xFor(hovered() ?? 0)}
              chartWidth={layout().chartWidth}
            >
              <div class="mb-0.5 font-medium text-ink">
                Week of {point().label}
              </div>
              <div class="text-ink-muted tabular-nums">
                {point().value !== undefined
                  ? formatTrendValue(point().value ?? 0, props.unit)
                  : 'No data'}
                <Show when={point().detail}> · {point().detail}</Show>
              </div>
            </ChartTooltip>
          )}
        </Show>
      </Show>
    </div>
  );
}

export type DivergingPoint = {
  label: string;
  /** Plotted above the baseline. */
  positive: number;
  /** Plotted below the baseline (pass a positive magnitude). */
  negative: number;
};

type DivergingBarChartProps = {
  data: DivergingPoint[];
  positiveLabel: string;
  negativeLabel: string;
  ariaLabel: string;
};

/**
 * Diverging weekly columns around a zero baseline (lines added above, deleted
 * below) with gradient fills fading toward the baseline.
 */
export function DivergingBarChart(props: DivergingBarChartProps) {
  const uid = createUniqueId();
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.data.length
      ? innerWidth / props.data.length
      : innerWidth;
    const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(4, bandWidth * 0.36));
    const max = niceMax(
      Math.max(1, ...props.data.map((d) => Math.max(d.positive, d.negative)))
    );
    const zeroY = MARGIN.top + innerHeight / 2;
    const scale = (value: number) => (value / max) * (innerHeight / 2);
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      barWidth,
      max,
      zeroY,
      scale,
      labelEvery: bandWidth >= 34 ? 1 : 2,
    };
  });

  const bandX = (index: number) => MARGIN.left + index * layout().bandWidth;
  const bandCenter = (index: number) => bandX(index) + layout().bandWidth / 2;

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0}>
        <svg
          role="img"
          aria-label={props.ariaLabel}
          width={layout().chartWidth}
          height={CHART_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          <defs>
            <linearGradient id={`div-pos-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stop-color={POSITIVE_COLOR}
                stop-opacity="0.9"
              />
              <stop
                offset="100%"
                stop-color={POSITIVE_COLOR}
                stop-opacity="0.3"
              />
            </linearGradient>
            <linearGradient id={`div-neg-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stop-color={NEGATIVE_COLOR}
                stop-opacity="0.3"
              />
              <stop
                offset="100%"
                stop-color={NEGATIVE_COLOR}
                stop-opacity="0.9"
              />
            </linearGradient>
          </defs>

          {/* Dashed extremes + solid zero baseline */}
          <For each={[-1, 1]}>
            {(direction) => {
              const y = () =>
                layout().zeroY - direction * layout().scale(layout().max);
              return (
                <>
                  <line
                    x1={MARGIN.left}
                    x2={layout().chartWidth - MARGIN.right}
                    y1={y()}
                    y2={y()}
                    stroke="var(--color-edge-muted)"
                    stroke-width={1}
                    stroke-dasharray="2 5"
                  />
                  <text
                    x={MARGIN.left - 8}
                    y={y() + 3}
                    text-anchor="end"
                    class="fill-ink-extra-muted/80 text-[10px] tabular-nums"
                  >
                    {`${direction < 0 ? '−' : '+'}${COMPACT_FORMAT.format(layout().max)}`}
                  </text>
                </>
              );
            }}
          </For>
          <line
            x1={MARGIN.left}
            x2={layout().chartWidth - MARGIN.right}
            y1={layout().zeroY}
            y2={layout().zeroY}
            stroke="var(--color-edge)"
            stroke-width={1}
          />
          <text
            x={MARGIN.left - 8}
            y={layout().zeroY + 3}
            text-anchor="end"
            class="fill-ink-extra-muted/80 text-[10px] tabular-nums"
          >
            0
          </text>

          <Index each={props.data}>
            {(point, index) => {
              const x = () => bandCenter(index) - layout().barWidth / 2;
              return (
                <>
                  <Show when={point().positive > 0}>
                    <path
                      d={columnPath(
                        x(),
                        layout().zeroY - layout().scale(point().positive),
                        layout().barWidth,
                        layout().scale(point().positive)
                      )}
                      fill={`url(#div-pos-${uid})`}
                    />
                  </Show>
                  <Show when={point().negative > 0}>
                    {/* Mirrored columnPath: square at the baseline, rounded below. */}
                    <path
                      d={columnPath(
                        x(),
                        layout().zeroY - layout().scale(point().negative),
                        layout().barWidth,
                        layout().scale(point().negative)
                      )}
                      fill={`url(#div-neg-${uid})`}
                      transform={`rotate(180 ${bandCenter(index)} ${layout().zeroY})`}
                    />
                  </Show>
                  <rect
                    x={bandX(index)}
                    y={MARGIN.top}
                    width={layout().bandWidth}
                    height={layout().innerHeight}
                    fill="transparent"
                    onMouseEnter={() => setHovered(index)}
                  />
                </>
              );
            }}
          </Index>

          <Show when={hovered() !== undefined}>
            <Crosshair x={bandCenter(hovered() ?? 0)} />
          </Show>

          <XLabels
            labels={props.data.map((d) => d.label)}
            centerFor={bandCenter}
            every={layout().labelEvery}
          />
        </svg>

        <Show when={hovered() !== undefined && props.data[hovered() ?? 0]}>
          {(point) => (
            <ChartTooltip
              x={bandCenter(hovered() ?? 0)}
              chartWidth={layout().chartWidth}
            >
              <div class="mb-1 font-medium text-ink">
                Week of {point().label}
              </div>
              <TooltipRow
                color={POSITIVE_COLOR}
                label={props.positiveLabel}
                value={`+${COMPACT_FORMAT.format(point().positive)}`}
              />
              <TooltipRow
                color={NEGATIVE_COLOR}
                label={props.negativeLabel}
                value={`−${COMPACT_FORMAT.format(point().negative)}`}
              />
            </ChartTooltip>
          )}
        </Show>
      </Show>
    </div>
  );
}

export function DivergingLegend(props: {
  positiveLabel: string;
  negativeLabel: string;
}) {
  return (
    <div class="flex items-center gap-3">
      <LegendSwatch color={POSITIVE_COLOR} label={props.positiveLabel} />
      <LegendSwatch color={NEGATIVE_COLOR} label={props.negativeLabel} />
    </div>
  );
}

export type BeeswarmGroup = {
  key: string;
  label: string;
  color: string;
  /** One dot per sample (e.g. days to merge per PR). */
  samples: number[];
  median: number | undefined;
};

type BeeswarmChartProps = {
  groups: BeeswarmGroup[];
  /** Unit suffix for tick + tooltip values (e.g. "d"). */
  unit?: string;
  ariaLabel: string;
};

const BEESWARM_HEIGHT = 248;

/**
 * Strip plot of individual samples per group (à la Linear's "cycle time by
 * agent"): jittered dots, dashed column separators, and a median tick per
 * group. Outliers beyond the axis clamp to the top at reduced opacity.
 */
export function BeeswarmChart(props: BeeswarmChartProps) {
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = BEESWARM_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.groups.length
      ? innerWidth / props.groups.length
      : innerWidth;
    // Scale to the ~95th percentile so one outlier doesn't flatten the swarm.
    const all = props.groups.flatMap((g) => g.samples).sort((a, b) => a - b);
    const p95 = all.length ? all[Math.floor((all.length - 1) * 0.95)] : 1;
    const max = niceMax(Math.max(1, p95));
    const yFor = (value: number) =>
      MARGIN.top + innerHeight * (1 - Math.min(value, max) / max);
    const centerFor = (index: number) =>
      MARGIN.left + index * bandWidth + bandWidth / 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      max,
      yFor,
      centerFor,
      ticks: [0, max / 2, max].filter((t) => Number.isInteger(t) || t === max),
    };
  });

  const formatValue = (value: number) =>
    `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}${props.unit ?? ''}`;

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0 && props.groups.length > 0}>
        <svg
          role="img"
          aria-label={props.ariaLabel}
          width={layout().chartWidth}
          height={BEESWARM_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          <For each={layout().ticks}>
            {(tick) => (
              <>
                <line
                  x1={MARGIN.left}
                  x2={layout().chartWidth - MARGIN.right}
                  y1={layout().yFor(tick)}
                  y2={layout().yFor(tick)}
                  stroke="var(--color-edge-muted)"
                  stroke-width={1}
                  stroke-dasharray="2 5"
                />
                <text
                  x={MARGIN.left - 8}
                  y={layout().yFor(tick) + 3}
                  text-anchor="end"
                  class="fill-ink-extra-muted/80 text-[10px] tabular-nums"
                >
                  {formatValue(tick)}
                </text>
              </>
            )}
          </For>

          {/* Dashed separators between group columns */}
          <Index each={props.groups.slice(1)}>
            {(_, index) => (
              <line
                x1={MARGIN.left + (index + 1) * layout().bandWidth}
                x2={MARGIN.left + (index + 1) * layout().bandWidth}
                y1={MARGIN.top}
                y2={BEESWARM_HEIGHT - MARGIN.bottom}
                stroke="var(--color-edge-muted)"
                stroke-width={1}
                stroke-dasharray="2 5"
                opacity={0.7}
              />
            )}
          </Index>

          <Index each={props.groups}>
            {(group, groupIndex) => {
              const spread = () => layout().bandWidth * 0.3;
              return (
                <>
                  <Index each={group().samples}>
                    {(sample, sampleIndex) => {
                      const clamped = () => sample() > layout().max;
                      return (
                        <circle
                          cx={
                            layout().centerFor(groupIndex) +
                            jitter(sampleIndex * 7 + groupIndex * 131) *
                              spread()
                          }
                          cy={layout().yFor(sample())}
                          r={3}
                          fill={group().color}
                          fill-opacity={clamped() ? 0.35 : 0.8}
                        >
                          <title>{formatValue(sample())}</title>
                        </circle>
                      );
                    }}
                  </Index>
                  <Show when={group().median !== undefined}>
                    <line
                      x1={layout().centerFor(groupIndex) - 12}
                      x2={layout().centerFor(groupIndex) + 12}
                      y1={layout().yFor(group().median ?? 0)}
                      y2={layout().yFor(group().median ?? 0)}
                      stroke={group().color}
                      stroke-width={2}
                      stroke-linecap="round"
                    />
                  </Show>
                  <text
                    x={layout().centerFor(groupIndex)}
                    y={BEESWARM_HEIGHT - 8}
                    text-anchor="middle"
                    class="fill-ink-extra-muted/80 text-[10px]"
                  >
                    {group().label}
                  </text>
                  <rect
                    x={MARGIN.left + groupIndex * layout().bandWidth}
                    y={MARGIN.top}
                    width={layout().bandWidth}
                    height={layout().innerHeight}
                    fill="transparent"
                    onMouseEnter={() => setHovered(groupIndex)}
                  />
                </>
              );
            }}
          </Index>
        </svg>

        <Show when={hovered() !== undefined && props.groups[hovered() ?? 0]}>
          {(group) => (
            <ChartTooltip
              x={layout().centerFor(hovered() ?? 0)}
              chartWidth={layout().chartWidth}
            >
              <div class="mb-1 font-medium text-ink">{group().label}</div>
              <TooltipRow
                color={group().color}
                label="Median"
                value={
                  group().median !== undefined
                    ? formatValue(group().median ?? 0)
                    : '—'
                }
              />
              <TooltipRow label="Merged PRs" value={group().samples.length} />
            </ChartTooltip>
          )}
        </Show>
      </Show>
    </div>
  );
}

export type DonutSegment = {
  key: string;
  label: string;
  count: number;
  color: string;
};

type DonutChartProps = {
  segments: DonutSegment[];
  /** Center stat when nothing is hovered. */
  centerValue: string | number;
  centerCaption: string;
  ariaLabel: string;
};

const DONUT_SIZE = 200;
const DONUT_RADIUS = 78;
const DONUT_STROKE = 11;
const DONUT_GAP_DEG = 2;

function polar(angleDeg: number, radius: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: DONUT_SIZE / 2 + radius * Math.cos(rad),
    y: DONUT_SIZE / 2 + radius * Math.sin(rad),
  };
}

function donutArcPath(startDeg: number, endDeg: number): string {
  // A single visible segment sweeps the full 360°, where one arc command with
  // identical endpoints is implementation-defined; draw two half circles.
  if (endDeg - startDeg >= 360) {
    const top = polar(0, DONUT_RADIUS);
    const bottom = polar(180, DONUT_RADIUS);
    return (
      `M ${top.x} ${top.y} ` +
      `A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 1 1 ${bottom.x} ${bottom.y} ` +
      `A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 1 1 ${top.x} ${top.y}`
    );
  }
  const start = polar(startDeg, DONUT_RADIUS);
  const end = polar(endDeg, DONUT_RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Interactive donut with a center stat: rounded-cap arc segments with angular
 * gaps; hovering a segment swaps the center readout for that segment's label
 * and count (identity also carries via the legend the caller renders).
 */
export function DonutChart(props: DonutChartProps) {
  const [hovered, setHovered] = createSignal<string | undefined>();

  const arcs = createMemo(() => {
    const visible = props.segments.filter((segment) => segment.count > 0);
    const total = visible.reduce((sum, segment) => sum + segment.count, 0);
    if (total === 0) return [];

    const gap = visible.length > 1 ? DONUT_GAP_DEG : 0;

    let cursor = 0;
    return visible.map((segment) => {
      const sweep = (segment.count / total) * 360;
      const start = cursor + gap / 2;
      const end = cursor + sweep - gap / 2;
      cursor += sweep;
      return { segment, start, end, mid: cursor - sweep / 2 };
    });
  });

  const hoveredSegment = createMemo(() =>
    props.segments.find((segment) => segment.key === hovered())
  );

  return (
    <div class="relative" style={{ width: `${DONUT_SIZE}px` }}>
      <svg
        role="img"
        aria-label={props.ariaLabel}
        width={DONUT_SIZE}
        height={DONUT_SIZE}
        onMouseLeave={() => setHovered(undefined)}
      >
        {/* Faint track ring behind the segments */}
        <circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_RADIUS}
          fill="none"
          stroke="var(--color-ink)"
          stroke-opacity={0.04}
          stroke-width={DONUT_STROKE}
        />
        <For each={arcs()}>
          {(arc) => {
            const active = () => hovered() === arc.segment.key;
            const dimmed = () => hovered() !== undefined && !active();
            return (
              <Show
                when={arc.end > arc.start}
                fallback={
                  <circle
                    cx={polar(arc.mid, DONUT_RADIUS).x}
                    cy={polar(arc.mid, DONUT_RADIUS).y}
                    r={DONUT_STROKE / 2}
                    fill={arc.segment.color}
                    opacity={dimmed() ? 0.35 : 1}
                    onMouseEnter={() => setHovered(arc.segment.key)}
                  />
                }
              >
                <path
                  d={donutArcPath(arc.start, arc.end)}
                  fill="none"
                  stroke={arc.segment.color}
                  stroke-width={active() ? DONUT_STROKE + 3 : DONUT_STROKE}
                  stroke-linecap="butt"
                  opacity={dimmed() ? 0.35 : 1}
                  onMouseEnter={() => setHovered(arc.segment.key)}
                />
              </Show>
            );
          }}
        </For>
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <Show
          when={hoveredSegment()}
          fallback={
            <>
              <span class="text-2xl font-semibold text-ink leading-tight">
                {props.centerValue}
              </span>
              <span class="max-w-24 text-[11px] text-ink-extra-muted">
                {props.centerCaption}
              </span>
            </>
          }
        >
          {(segment) => (
            <>
              <span class="text-2xl font-semibold text-ink leading-tight tabular-nums">
                {segment().count}
              </span>
              <span class="max-w-24 truncate text-[11px] text-ink-muted">
                {segment().label}
              </span>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

export function DonutLegend(props: { segments: DonutSegment[] }) {
  return (
    <div class="flex min-w-0 flex-col gap-2">
      <For each={props.segments}>
        {(segment) => (
          <span class="inline-flex items-center gap-2 text-xs text-ink-muted">
            <span
              class="size-2 shrink-0 rounded-full"
              style={{ 'background-color': segment.color }}
            />
            <span class="min-w-0 flex-1 truncate">{segment.label}</span>
            <span class="text-ink tabular-nums">{segment.count}</span>
          </span>
        )}
      </For>
    </div>
  );
}

export type HistogramBin = {
  key: string;
  label: string;
  /** Longer description for the tooltip (e.g. "< 100 lines"). */
  description?: string;
  count: number;
  color: string;
};

type ColumnHistogramProps = {
  bins: HistogramBin[];
  ariaLabel: string;
};

const HISTOGRAM_HEIGHT = 176;

/**
 * Column histogram with gradient fills, dashed gridlines, and a direct count
 * label on every cap (few bins, so labels stay sparse).
 */
export function ColumnHistogram(props: ColumnHistogramProps) {
  const uid = createUniqueId();
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = HISTOGRAM_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.bins.length
      ? innerWidth / props.bins.length
      : innerWidth;
    const barWidth = Math.min(36, Math.max(8, bandWidth * 0.44));
    const max = niceMax(Math.max(1, ...props.bins.map((bin) => bin.count)));
    const yFor = (value: number) =>
      MARGIN.top + innerHeight * (1 - value / max);
    const centerFor = (index: number) =>
      MARGIN.left + index * bandWidth + bandWidth / 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      barWidth,
      max,
      yFor,
      centerFor,
      baseY: MARGIN.top + innerHeight,
      ticks: [0, max / 2, max].filter((t) => Number.isInteger(t) || t === max),
    };
  });

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0}>
        <svg
          role="img"
          aria-label={props.ariaLabel}
          width={layout().chartWidth}
          height={HISTOGRAM_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          <defs>
            <For each={props.bins}>
              {(bin, index) => (
                <linearGradient
                  id={`hist-${uid}-${index()}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stop-color={bin.color}
                    stop-opacity="0.95"
                  />
                  <stop
                    offset="100%"
                    stop-color={bin.color}
                    stop-opacity="0.35"
                  />
                </linearGradient>
              )}
            </For>
          </defs>

          <DashedGrid
            ticks={layout().ticks}
            yFor={layout().yFor}
            x1={MARGIN.left}
            x2={layout().chartWidth - MARGIN.right}
            format={(v) => COMPACT_FORMAT.format(v)}
          />

          <Index each={props.bins}>
            {(bin, index) => {
              const height = () =>
                (bin().count / layout().max) * layout().innerHeight;
              return (
                <>
                  <Show when={bin().count > 0}>
                    <path
                      d={columnPath(
                        layout().centerFor(index) - layout().barWidth / 2,
                        layout().baseY - height(),
                        layout().barWidth,
                        height()
                      )}
                      fill={`url(#hist-${uid}-${index})`}
                      opacity={
                        hovered() !== undefined && hovered() !== index
                          ? 0.45
                          : 1
                      }
                    />
                    <text
                      x={layout().centerFor(index)}
                      y={layout().baseY - height() - 6}
                      text-anchor="middle"
                      class="fill-ink-muted text-[10px] font-medium tabular-nums"
                    >
                      {COMPACT_FORMAT.format(bin().count)}
                    </text>
                  </Show>
                  <text
                    x={layout().centerFor(index)}
                    y={HISTOGRAM_HEIGHT - 8}
                    text-anchor="middle"
                    class="fill-ink-extra-muted/80 text-[10px]"
                  >
                    {bin().label}
                  </text>
                  <rect
                    x={MARGIN.left + index * layout().bandWidth}
                    y={MARGIN.top}
                    width={layout().bandWidth}
                    height={layout().innerHeight}
                    fill="transparent"
                    onMouseEnter={() => setHovered(index)}
                  />
                </>
              );
            }}
          </Index>
        </svg>

        <Show when={hovered() !== undefined && props.bins[hovered() ?? 0]}>
          {(bin) => (
            <ChartTooltip
              x={layout().centerFor(hovered() ?? 0)}
              chartWidth={layout().chartWidth}
            >
              <div class="mb-0.5 font-medium text-ink">
                {bin().label}
                <Show when={bin().description}>
                  <span class="text-ink-extra-muted">
                    {' '}
                    · {bin().description}
                  </span>
                </Show>
              </div>
              <div class="text-ink-muted tabular-nums">
                {bin().count} pull requests
              </div>
            </ChartTooltip>
          )}
        </Show>
      </Show>
    </div>
  );
}

export type HorizontalBarRow = {
  key: string;
  label: JSX.Element;
  /** Stacked segments; single-segment rows render a plain bar. */
  segments: Array<{ label: string; value: number; color: string }>;
};

type HorizontalBarListProps = {
  rows: HorizontalBarRow[];
  /** Value formatter for the row total at the bar end. */
  formatValue?: (value: number) => string;
};

/**
 * Label + horizontal bar + value rows on a shared scale, with 2px surface
 * gaps between stacked segments and the total at each bar's end.
 */
export function HorizontalBarList(props: HorizontalBarListProps) {
  const max = createMemo(() =>
    Math.max(
      1,
      ...props.rows.map((row) =>
        row.segments.reduce((sum, segment) => sum + segment.value, 0)
      )
    )
  );
  const format = (value: number) =>
    (props.formatValue ?? ((v: number) => COMPACT_FORMAT.format(v)))(value);

  return (
    <div class="flex flex-col">
      <For each={props.rows}>
        {(row) => {
          const total = () =>
            row.segments.reduce((sum, segment) => sum + segment.value, 0);
          return (
            <div class="group/bar-row -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink/3">
              <div class="w-36 min-w-0 shrink-0 truncate text-xs text-ink">
                {row.label}
              </div>
              {/* Full-width track keeps every row on one shared scale */}
              <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                <div
                  class="absolute inset-y-0 left-0 flex gap-[2px]"
                  style={{ width: `${(total() / max()) * 100}%` }}
                >
                  <For each={row.segments.filter((s) => s.value > 0)}>
                    {(segment) => (
                      <div
                        class="h-full min-w-1 rounded-full"
                        style={{
                          'background-image': `linear-gradient(90deg, color-mix(in oklab, ${segment.color} 62%, transparent), ${segment.color})`,
                          'flex-grow': segment.value,
                          'flex-basis': '0px',
                        }}
                        title={`${segment.label}: ${format(segment.value)}`}
                      />
                    )}
                  </For>
                </div>
              </div>
              <span class="w-9 shrink-0 text-right text-[11px] text-ink-muted tabular-nums group-hover/bar-row:text-ink">
                {format(total())}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}

type StatTileProps = {
  label: string;
  /** Numbers are locale-formatted; pass a string for pre-formatted values ("1.2d"). */
  value: number | string;
  /** Optional context line under the value (e.g. "last 30 days"). */
  detail?: JSX.Element;
};

const STAT_VALUE_FORMAT = new Intl.NumberFormat();

export function StatTile(props: StatTileProps) {
  return (
    <div class="flex flex-col gap-1 rounded-xl bg-ink/3 p-4">
      <span class="text-[11px] text-ink-muted">{props.label}</span>
      <span class="text-2xl font-semibold text-ink leading-tight">
        {typeof props.value === 'number'
          ? STAT_VALUE_FORMAT.format(props.value)
          : props.value}
      </span>
      <Show when={props.detail}>
        <span class="text-[11px] text-ink-extra-muted">{props.detail}</span>
      </Show>
    </div>
  );
}
