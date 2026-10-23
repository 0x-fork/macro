import { useCalendarSearchUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { CALENDAR_ONLY_SEARCH_FILTERS } from '@app/features/calendar-view/calendar-only-search-filters';
import type { CalendarEventEntity, EntityData, WithSearch } from '@entity';
import { queryReadyGate } from '@queries/gate';
import {
  type SearchSoupQueryArgs,
  useSearchSoupQuery,
} from '@queries/soup/search';
import { createLazyMemo } from '@solid-primitives/memo';
import type { Accessor } from 'solid-js';
import type { CalendarEventMentionItem } from '../../../../utils/mentionsUtils';

/** The calendar's own search waits for this many characters, and so does the menu. */
const MIN_QUERY_LENGTH = 3;

type UseCalendarEventMentionOptions = {
  searchTerm: Accessor<string>;
  enabled: Accessor<boolean>;
};

/** When the row's instance starts: its occurrence when search resolved one. */
function calendarEventMentionWhen(
  event: Pick<CalendarEventEntity, 'time' | 'occurrenceKey'>
): string | undefined {
  const time = event.time;
  if (!time) return;
  if (time.kind === 'allDay') {
    const date = new Date(
      `${(event.occurrenceKey ?? time.startDate).slice(0, 10)}T00:00:00Z`
    );
    if (Number.isNaN(date.getTime())) return;
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  const start = new Date(event.occurrenceKey ?? time.startsAt);
  if (Number.isNaN(start.getTime())) return;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);
}

/** One row per event, pinned to its occurrence when it repeats, as Copy event does. */
export function calendarEventMentionItems(
  results: readonly CalendarEventEntity[]
): CalendarEventMentionItem[] {
  const seen = new Set<string>();
  const items: CalendarEventMentionItem[] = [];
  for (const event of results) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    items.push({
      kind: 'calendarEvent',
      id: event.id,
      data: {
        eventId: event.id,
        title: event.name || 'Untitled event',
        occurrenceKey: event.isRecurring ? event.occurrenceKey : undefined,
        when: calendarEventMentionWhen(event),
      },
    });
  }
  return items;
}

/**
 * Calendar events for the mention menu, through the same unified search the
 * calendar's own search uses, and only where that search is offered.
 */
export function useCalendarEventMention(
  options: UseCalendarEventMentionOptions
) {
  const calendarSearch = useCalendarSearchUiFlag();
  const term = () => options.searchTerm().trim();
  const enabled = () =>
    options.enabled() && calendarSearch() && term().length >= MIN_QUERY_LENGTH;

  const args = createLazyMemo(
    (): SearchSoupQueryArgs => ({
      params: { cursor: null, page_size: 10 },
      body: {
        match_type: 'partial',
        search_on: 'name',
        query: term(),
        filters: CALENDAR_ONLY_SEARCH_FILTERS,
      },
    })
  );
  const search = useSearchSoupQuery(args, () => ({ enabled: enabled() }));

  const events = createLazyMemo((): CalendarEventMentionItem[] => {
    if (!enabled() || !queryReadyGate(search)) return [];
    return calendarEventMentionItems(
      search.data.filter(
        (
          entity
        ): entity is WithSearch<
          Extract<EntityData, { type: 'calendar_event' }>
        > => entity.type === 'calendar_event'
      )
    );
  });

  return { events };
}
