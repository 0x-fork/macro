import { cn } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  Index,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import type { WeeklyPrActivity } from './model';

/**
 * Lightweight, dependency-free SVG charts for the codebase insights tab.
 * Colors come from the app's semantic theme tokens so both series identity
 * (legend + labels, never color alone) and dark mode hold up.
 */

const CHART_HEIGHT = 168;
const MARGIN = { top: 8, right: 8, bottom: 22, left: 32 };
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;

const OPENED_COLOR = 'var(--color-accent)';
const MERGED_COLOR = 'var(--color-success)';

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

/** Column with a 4px rounded data-end and a square baseline. */
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

export function LegendSwatch(props: { color: string; label: string }) {
  return (
    <span class="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span
        class="size-2.5 rounded-[3px]"
        style={{ 'background-color': props.color }}
      />
      {props.label}
    </span>
  );
}

type WeeklyActivityChartProps = {
  data: WeeklyPrActivity[];
};

/** Paired weekly columns: pull requests opened vs merged. */
export function WeeklyActivityChart(props: WeeklyActivityChartProps) {
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.data.length
      ? innerWidth / props.data.length
      : innerWidth;
    const barWidth = Math.min(
      MAX_BAR_WIDTH,
      Math.max(3, (bandWidth - BAR_GAP) * 0.32)
    );
    const max = niceMax(
      Math.max(1, ...props.data.map((d) => Math.max(d.opened, d.merged)))
    );
    const yFor = (value: number) =>
      MARGIN.top + innerHeight * (1 - value / max);
    const ticks = [0, max / 2, max].filter(
      (tick) => Number.isInteger(tick) || tick === max
    );
    // Thin x labels when bands get too narrow for every label to fit.
    const labelEvery = bandWidth >= 34 ? 1 : 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      barWidth,
      max,
      yFor,
      ticks,
      labelEvery,
    };
  });

  const bandX = (index: number) => MARGIN.left + index * layout().bandWidth;
  const bandCenter = (index: number) => bandX(index) + layout().bandWidth / 2;

  return (
    <div ref={containerRef} class="relative w-full">
      <Show when={width() > 0}>
        <svg
          role="img"
          aria-label="Pull requests opened and merged per week"
          width={layout().chartWidth}
          height={CHART_HEIGHT}
          onMouseLeave={() => setHovered(undefined)}
        >
          {/* Gridlines */}
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
                />
                <text
                  x={MARGIN.left - 6}
                  y={layout().yFor(tick) + 3}
                  text-anchor="end"
                  class="fill-ink-extra-muted text-[10px] tabular-nums"
                >
                  {tick}
                </text>
              </>
            )}
          </For>

          <Index each={props.data}>
            {(week, index) => {
              const openedHeight = () =>
                (week().opened / layout().max) * layout().innerHeight;
              const mergedHeight = () =>
                (week().merged / layout().max) * layout().innerHeight;
              const pairWidth = () => layout().barWidth * 2 + BAR_GAP;
              const pairStart = () => bandCenter(index) - pairWidth() / 2;

              return (
                <>
                  <Show when={hovered() === index}>
                    <rect
                      x={bandX(index)}
                      y={MARGIN.top}
                      width={layout().bandWidth}
                      height={layout().innerHeight}
                      class="fill-ink/4"
                      rx={4}
                    />
                  </Show>
                  <Show when={week().opened > 0}>
                    <path
                      d={columnPath(
                        pairStart(),
                        layout().yFor(week().opened),
                        layout().barWidth,
                        openedHeight()
                      )}
                      fill={OPENED_COLOR}
                    />
                  </Show>
                  <Show when={week().merged > 0}>
                    <path
                      d={columnPath(
                        pairStart() + layout().barWidth + BAR_GAP,
                        layout().yFor(week().merged),
                        layout().barWidth,
                        mergedHeight()
                      )}
                      fill={MERGED_COLOR}
                    />
                  </Show>
                  <Show when={index % layout().labelEvery === 0}>
                    <text
                      x={bandCenter(index)}
                      y={CHART_HEIGHT - 6}
                      text-anchor="middle"
                      class="fill-ink-extra-muted text-[10px]"
                    >
                      {week().label}
                    </text>
                  </Show>
                  {/* Hover hit target for the whole band */}
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
        </svg>

        <Show when={hovered() !== undefined && props.data[hovered() ?? 0]}>
          {(week) => (
            <div
              class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-menu px-2.5 py-1.5 text-xs shadow-menu ring ring-edge-muted"
              style={{
                left: `${Math.min(
                  Math.max(bandCenter(hovered() ?? 0), 56),
                  layout().chartWidth - 56
                )}px`,
                top: '-8px',
              }}
            >
              <div class="mb-1 font-medium text-ink">
                Week of {week().label}
              </div>
              <div class="flex items-center gap-1.5 text-ink-muted tabular-nums">
                <span
                  class="size-2 rounded-full"
                  style={{ 'background-color': OPENED_COLOR }}
                />
                Opened {week().opened}
              </div>
              <div class="flex items-center gap-1.5 text-ink-muted tabular-nums">
                <span
                  class="size-2 rounded-full"
                  style={{ 'background-color': MERGED_COLOR }}
                />
                Merged {week().merged}
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}

export function WeeklyActivityLegend() {
  return (
    <div class="flex items-center gap-3">
      <LegendSwatch color={OPENED_COLOR} label="Opened" />
      <LegendSwatch color={MERGED_COLOR} label="Merged" />
    </div>
  );
}

export type StackedBarSegment = {
  key: string;
  label: string;
  count: number;
  color: string;
};

type StackedStatusBarProps = {
  segments: StackedBarSegment[];
  class?: string;
};

/**
 * Horizontal part-to-whole bar with 2px surface gaps between segments and a
 * legend carrying label + count (identity is never color alone).
 */
export function StackedStatusBar(props: StackedStatusBarProps) {
  const total = createMemo(() =>
    props.segments.reduce((sum, segment) => sum + segment.count, 0)
  );
  const visible = createMemo(() =>
    props.segments.filter((segment) => segment.count > 0)
  );

  return (
    <div class={cn('flex flex-col gap-2.5', props.class)}>
      <Show
        when={total() > 0}
        fallback={<div class="h-3 rounded-full bg-ink/6" />}
      >
        <div class="flex h-3 w-full gap-[2px]">
          <For each={visible()}>
            {(segment) => (
              <div
                class="min-w-1 rounded-[3px]"
                style={{
                  'background-color': segment.color,
                  'flex-grow': segment.count,
                  'flex-basis': '0px',
                }}
                title={`${segment.label}: ${segment.count}`}
              />
            )}
          </For>
        </div>
      </Show>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <For each={props.segments}>
          {(segment) => (
            <span class="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                class="size-2 rounded-full"
                style={{ 'background-color': segment.color }}
              />
              {segment.label}
              <span class="text-ink tabular-nums">{segment.count}</span>
            </span>
          )}
        </For>
      </div>
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
    <div class="flex flex-col gap-1 rounded-xl bg-surface/50 p-3 ring ring-edge-muted ring-inset">
      <span class="text-xs text-ink-muted">{props.label}</span>
      <span class="text-2xl font-semibold text-ink leading-tight">
        {typeof props.value === 'number'
          ? STAT_VALUE_FORMAT.format(props.value)
          : props.value}
      </span>
      <Show when={props.detail}>
        <span class="text-xs text-ink-extra-muted">{props.detail}</span>
      </Show>
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
 * Single-series trend line: 2px line, ≥8px markers with a surface ring, gaps
 * where a period has no data, hover tooltip per point. One series → the title
 * names it, no legend box.
 */
export function TrendLineChart(props: TrendLineChartProps) {
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
    const ticks = [0, max / 2, max].filter(
      (tick) => Number.isInteger(tick) || tick === max
    );
    const labelEvery = bandWidth >= 34 ? 1 : 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      max,
      yFor,
      xFor,
      ticks,
      labelEvery,
    };
  });

  // Split into contiguous line segments across gaps.
  const segments = createMemo(() => {
    const result: Array<Array<{ index: number; value: number }>> = [];
    let current: Array<{ index: number; value: number }> = [];
    props.data.forEach((point, index) => {
      if (point.value === undefined) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push({ index, value: point.value });
    });
    if (current.length) result.push(current);
    return result;
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
                />
                <text
                  x={MARGIN.left - 6}
                  y={layout().yFor(tick) + 3}
                  text-anchor="end"
                  class="fill-ink-extra-muted text-[10px] tabular-nums"
                >
                  {formatTrendValue(tick, props.unit)}
                </text>
              </>
            )}
          </For>

          <For each={segments()}>
            {(segment) => (
              <polyline
                fill="none"
                stroke={color()}
                stroke-width={2}
                stroke-linecap="round"
                stroke-linejoin="round"
                points={segment
                  .map(
                    (p) => `${layout().xFor(p.index)},${layout().yFor(p.value)}`
                  )
                  .join(' ')}
              />
            )}
          </For>

          <Index each={props.data}>
            {(point, index) => (
              <>
                <Show when={point().value !== undefined}>
                  <circle
                    cx={layout().xFor(index)}
                    cy={layout().yFor(point().value ?? 0)}
                    r={4}
                    fill={color()}
                    stroke="var(--color-surface)"
                    stroke-width={2}
                  />
                </Show>
                <Show when={index % layout().labelEvery === 0}>
                  <text
                    x={layout().xFor(index)}
                    y={CHART_HEIGHT - 6}
                    text-anchor="middle"
                    class="fill-ink-extra-muted text-[10px]"
                  >
                    {point().label}
                  </text>
                </Show>
                <rect
                  x={MARGIN.left + index * layout().bandWidth}
                  y={MARGIN.top}
                  width={layout().bandWidth}
                  height={layout().innerHeight}
                  fill="transparent"
                  onMouseEnter={() => setHovered(index)}
                />
              </>
            )}
          </Index>
        </svg>

        <Show when={hovered() !== undefined && props.data[hovered() ?? 0]}>
          {(point) => (
            <div
              class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-menu px-2.5 py-1.5 text-xs shadow-menu ring ring-edge-muted"
              style={{
                left: `${Math.min(
                  Math.max(layout().xFor(hovered() ?? 0), 56),
                  layout().chartWidth - 56
                )}px`,
                top: '-8px',
              }}
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
            </div>
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

const POSITIVE_COLOR = 'var(--color-success)';
const NEGATIVE_COLOR = 'var(--color-failure)';

const COMPACT_FORMAT = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Diverging weekly columns around a zero baseline (e.g. lines added above,
 * lines deleted below). Both directions share one symmetric scale.
 */
export function DivergingBarChart(props: DivergingBarChartProps) {
  const [containerRef, width] = useElementWidth();
  const [hovered, setHovered] = createSignal<number | undefined>();

  const layout = createMemo(() => {
    const chartWidth = Math.max(width(), 0);
    const innerWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 0);
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const bandWidth = props.data.length
      ? innerWidth / props.data.length
      : innerWidth;
    const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(4, bandWidth * 0.4));
    const max = niceMax(
      Math.max(1, ...props.data.map((d) => Math.max(d.positive, d.negative)))
    );
    const zeroY = MARGIN.top + innerHeight / 2;
    const scale = (value: number) => (value / max) * (innerHeight / 2);
    const labelEvery = bandWidth >= 34 ? 1 : 2;
    return {
      chartWidth,
      innerHeight,
      bandWidth,
      barWidth,
      max,
      zeroY,
      scale,
      labelEvery,
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
          {/* Symmetric ticks: +max, 0, -max */}
          <For each={[-1, 0, 1]}>
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
                  />
                  <text
                    x={MARGIN.left - 6}
                    y={y() + 3}
                    text-anchor="end"
                    class="fill-ink-extra-muted text-[10px] tabular-nums"
                  >
                    {direction === 0
                      ? '0'
                      : `${direction < 0 ? '−' : '+'}${COMPACT_FORMAT.format(layout().max)}`}
                  </text>
                </>
              );
            }}
          </For>

          <Index each={props.data}>
            {(point, index) => {
              const x = () => bandCenter(index) - layout().barWidth / 2;
              return (
                <>
                  <Show when={hovered() === index}>
                    <rect
                      x={bandX(index)}
                      y={MARGIN.top}
                      width={layout().bandWidth}
                      height={layout().innerHeight}
                      class="fill-ink/4"
                      rx={4}
                    />
                  </Show>
                  <Show when={point().positive > 0}>
                    <path
                      d={columnPath(
                        x(),
                        layout().zeroY - layout().scale(point().positive),
                        layout().barWidth,
                        layout().scale(point().positive)
                      )}
                      fill={POSITIVE_COLOR}
                    />
                  </Show>
                  <Show when={point().negative > 0}>
                    {/* Mirrored columnPath: square at the baseline, rounded at the data end below. */}
                    <path
                      d={columnPath(
                        x(),
                        layout().zeroY - layout().scale(point().negative),
                        layout().barWidth,
                        layout().scale(point().negative)
                      )}
                      fill={NEGATIVE_COLOR}
                      transform={`rotate(180 ${bandCenter(index)} ${layout().zeroY})`}
                    />
                  </Show>
                  <Show when={index % layout().labelEvery === 0}>
                    <text
                      x={bandCenter(index)}
                      y={CHART_HEIGHT - 6}
                      text-anchor="middle"
                      class="fill-ink-extra-muted text-[10px]"
                    >
                      {point().label}
                    </text>
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
        </svg>

        <Show when={hovered() !== undefined && props.data[hovered() ?? 0]}>
          {(point) => (
            <div
              class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-menu px-2.5 py-1.5 text-xs shadow-menu ring ring-edge-muted"
              style={{
                left: `${Math.min(
                  Math.max(bandCenter(hovered() ?? 0), 56),
                  layout().chartWidth - 56
                )}px`,
                top: '-8px',
              }}
            >
              <div class="mb-1 font-medium text-ink">
                Week of {point().label}
              </div>
              <div class="flex items-center gap-1.5 text-ink-muted tabular-nums">
                <span
                  class="size-2 rounded-full"
                  style={{ 'background-color': POSITIVE_COLOR }}
                />
                {props.positiveLabel} +{COMPACT_FORMAT.format(point().positive)}
              </div>
              <div class="flex items-center gap-1.5 text-ink-muted tabular-nums">
                <span
                  class="size-2 rounded-full"
                  style={{ 'background-color': NEGATIVE_COLOR }}
                />
                {props.negativeLabel} −{COMPACT_FORMAT.format(point().negative)}
              </div>
            </div>
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
    <div class="flex flex-col gap-2">
      <For each={props.rows}>
        {(row) => {
          const total = () =>
            row.segments.reduce((sum, segment) => sum + segment.value, 0);
          return (
            <div class="flex items-center gap-2">
              <div class="w-32 min-w-0 shrink-0 truncate text-xs text-ink">
                {row.label}
              </div>
              <div class="flex h-3 flex-1 items-center">
                <div
                  class="flex h-3 gap-[2px]"
                  style={{ width: `${(total() / max()) * 100}%` }}
                >
                  <For each={row.segments.filter((s) => s.value > 0)}>
                    {(segment) => (
                      <div
                        class="h-3 min-w-1 rounded-[3px]"
                        style={{
                          'background-color': segment.color,
                          'flex-grow': segment.value,
                          'flex-basis': '0px',
                        }}
                        title={`${segment.label}: ${format(segment.value)}`}
                      />
                    )}
                  </For>
                </div>
                <span class="ml-1.5 shrink-0 text-xs text-ink-muted tabular-nums">
                  {format(total())}
                </span>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
