import { endOfDay, format, isToday, startOfDay } from 'date-fns';
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { CalendarEvent } from '../model/types';
import {
  DAY_HEIGHT_PX,
  durationHeightPx,
  eventIntersectsDay,
  formatHourLabel,
  HOUR_HEIGHT_PX,
  HOURS,
  instantFromGridClick,
  offsetTopPx,
} from '../util/dates';
import { useCalendar } from './CalendarContext';
import { EVENT_COLOR_CLASSES } from './colors';

/** Minutes-since-midnight → top pixels, used by the now-indicator. */
function nowOffsetPx(now: number): number {
  return offsetTopPx(now);
}

function EventBlock(props: { event: CalendarEvent; day: Date }) {
  const calendar = useCalendar();
  const dayStart = () => startOfDay(props.day).getTime();
  const dayEnd = () => endOfDay(props.day).getTime();
  const clampedStart = () => Math.max(props.event.startMs, dayStart());
  const clampedEnd = () => Math.min(props.event.endMs, dayEnd());

  return (
    <button
      type="button"
      class={`absolute left-0.5 right-0.5 rounded-xs px-1.5 py-0.5 text-left text-xs overflow-hidden ${EVENT_COLOR_CLASSES[props.event.color].block}`}
      style={{
        top: `${offsetTopPx(clampedStart())}px`,
        height: `${durationHeightPx(clampedStart(), clampedEnd())}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        calendar.openEdit(props.event);
      }}
    >
      <div class="font-medium truncate">
        {props.event.title || 'Untitled event'}
      </div>
      <div class="truncate text-ink-muted">
        {format(props.event.startMs, 'h:mm a')}
      </div>
    </button>
  );
}

function DayColumn(props: { day: Date }) {
  const calendar = useCalendar();

  const timedEvents = createMemo(() =>
    calendar
      .events()
      .filter(
        (e) => !e.allDay && eventIntersectsDay(e.startMs, e.endMs, props.day)
      )
  );

  let columnRef: HTMLDivElement | undefined;

  const handleCreate = (e: MouseEvent) => {
    if (!columnRef) return;
    const rect = columnRef.getBoundingClientRect();
    const y = e.clientY - rect.top;
    calendar.openNew(instantFromGridClick(props.day, y));
  };

  return (
    <div
      ref={columnRef}
      class="relative flex-1 border-r border-edge-muted last:border-r-0"
      style={{ height: `${DAY_HEIGHT_PX}px` }}
      onClick={handleCreate}
    >
      <For each={HOURS}>
        {(hour) => (
          <Show when={hour !== 0}>
            <div
              class="absolute inset-x-0 border-t border-edge-muted/60"
              style={{ top: `${hour * HOUR_HEIGHT_PX}px` }}
            />
          </Show>
        )}
      </For>

      <Show when={isToday(props.day)}>
        <NowIndicator />
      </Show>

      <For each={timedEvents()}>
        {(event) => <EventBlock event={event} day={props.day} />}
      </For>
    </div>
  );
}

function NowIndicator() {
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    onCleanup(() => window.clearInterval(id));
  });
  return (
    <div
      class="absolute inset-x-0 z-10 flex items-center pointer-events-none"
      style={{ top: `${nowOffsetPx(now())}px` }}
    >
      <div class="size-2 -ml-1 rounded-full bg-failure" />
      <div class="h-px flex-1 bg-failure" />
    </div>
  );
}

function AllDayRow(props: { days: Date[] }) {
  const calendar = useCalendar();
  const allDayFor = (day: Date) =>
    calendar
      .events()
      .filter((e) => e.allDay && eventIntersectsDay(e.startMs, e.endMs, day));

  const hasAny = createMemo(() => calendar.events().some((e) => e.allDay));

  return (
    <Show when={hasAny()}>
      <div class="flex border-b border-edge-muted">
        <div class="w-14 shrink-0 border-r border-edge-muted py-1 pr-2 text-right text-[10px] uppercase text-ink-extra-muted">
          all-day
        </div>
        <For each={props.days}>
          {(day) => (
            <div class="flex-1 border-r border-edge-muted last:border-r-0 p-0.5 space-y-0.5">
              <For each={allDayFor(day)}>
                {(event) => (
                  <button
                    type="button"
                    class={`block w-full truncate rounded-xs px-1.5 py-0.5 text-left text-xs ${EVENT_COLOR_CLASSES[event.color].block}`}
                    onClick={() => calendar.openEdit(event)}
                  >
                    {event.title || 'Untitled event'}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/** Week/day time grid. `days.length === 1` renders the day view. */
export function TimeGrid(props: { days: Date[] }) {
  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Column headers */}
      <div class="flex border-b border-edge-muted bg-surface">
        <div class="w-14 shrink-0 border-r border-edge-muted" />
        <For each={props.days}>
          {(day) => (
            <div class="flex-1 border-r border-edge-muted last:border-r-0 py-1.5 text-center">
              <div class="text-[11px] uppercase text-ink-muted">
                {format(day, 'EEE')}
              </div>
              <div
                class={`text-lg leading-tight ${isToday(day) ? 'text-accent font-semibold' : 'text-ink'}`}
              >
                {format(day, 'd')}
              </div>
            </div>
          )}
        </For>
      </div>

      <AllDayRow days={props.days} />

      {/* Scrollable time grid */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex" style={{ height: `${DAY_HEIGHT_PX}px` }}>
          {/* Hour gutter */}
          <div class="w-14 shrink-0 border-r border-edge-muted">
            <For each={HOURS}>
              {(hour) => (
                <div
                  class="relative text-right pr-2 text-[10px] text-ink-extra-muted"
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                >
                  <Show when={hour !== 0}>
                    <span class="absolute -top-1.5 right-2">
                      {formatHourLabel(hour)}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <For each={props.days}>{(day) => <DayColumn day={day} />}</For>
        </div>
      </div>
    </div>
  );
}
