import UsersIcon from '@phosphor/users.svg';
import { format, isSameDay } from 'date-fns';
import { createMemo, For, Show } from 'solid-js';
import type { CalendarEvent } from '../model/types';
import { formatTimeRange } from '../util/dates';
import { useCalendar } from './CalendarContext';
import { EVENT_COLOR_CLASSES } from './colors';

interface DayGroup {
  day: Date;
  events: CalendarEvent[];
}

export function ListView() {
  const calendar = useCalendar();

  const groups = createMemo<DayGroup[]>(() => {
    const sorted = [...calendar.events()].sort((a, b) => a.startMs - b.startMs);
    const out: DayGroup[] = [];
    for (const event of sorted) {
      const day = new Date(event.startMs);
      const last = out[out.length - 1];
      if (last && isSameDay(last.day, day)) {
        last.events.push(event);
      } else {
        out.push({ day, events: [event] });
      }
    }
    return out;
  });

  return (
    <div class="h-full overflow-y-auto">
      <Show
        when={groups().length > 0}
        fallback={
          <div class="flex h-full items-center justify-center text-sm text-ink-muted">
            No events in this range.
          </div>
        }
      >
        <div class="mx-auto max-w-3xl px-4 py-4">
          <For each={groups()}>
            {(group) => (
              <div class="mb-5">
                <div class="mb-1.5 flex items-baseline gap-2 border-b border-edge-muted pb-1">
                  <span class="text-sm font-semibold text-ink">
                    {format(group.day, 'EEEE')}
                  </span>
                  <span class="text-xs text-ink-muted">
                    {format(group.day, 'MMMM d, yyyy')}
                  </span>
                </div>
                <div class="flex flex-col">
                  <For each={group.events}>
                    {(event) => (
                      <button
                        type="button"
                        class="flex items-center gap-3 rounded-xs px-2 py-2 text-left hover:bg-hover"
                        onClick={() => calendar.openEdit(event)}
                      >
                        <span
                          class={`size-2.5 shrink-0 rounded-full ${EVENT_COLOR_CLASSES[event.color].dot}`}
                        />
                        <span class="w-32 shrink-0 text-xs text-ink-muted">
                          {event.allDay
                            ? 'All day'
                            : formatTimeRange(event.startMs, event.endMs)}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-sm text-ink">
                          {event.title || 'Untitled event'}
                        </span>
                        <Show when={event.location}>
                          <span class="hidden shrink-0 text-xs text-ink-muted sm:block">
                            {event.location}
                          </span>
                        </Show>
                        <Show when={event.attendees.length > 0}>
                          <span class="flex shrink-0 items-center gap-1 text-xs text-ink-muted [&_svg]:size-3.5">
                            <UsersIcon />
                            {event.attendees.length}
                          </span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
