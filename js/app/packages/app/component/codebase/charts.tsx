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

function LegendSwatch(props: { color: string; label: string }) {
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
  value: number;
  /** Optional context line under the value (e.g. "last 30 days"). */
  detail?: JSX.Element;
};

const STAT_VALUE_FORMAT = new Intl.NumberFormat();

export function StatTile(props: StatTileProps) {
  return (
    <div class="flex flex-col gap-1 rounded-xl bg-surface/50 p-3 ring ring-edge-muted ring-inset">
      <span class="text-xs text-ink-muted">{props.label}</span>
      <span class="text-2xl font-semibold text-ink leading-tight">
        {STAT_VALUE_FORMAT.format(props.value)}
      </span>
      <Show when={props.detail}>
        <span class="text-xs text-ink-extra-muted">{props.detail}</span>
      </Show>
    </div>
  );
}
