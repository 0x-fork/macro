import { useCalendarAddSharedEventFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { downloadCalendarEventIcs } from '@app/features/calendar-view/download-event-ics';
import { useHoldParentHoverCardOpen } from '@core/component/HoverCard';
import { toast } from '@core/component/Toast/Toast';
import { fireAndForget } from '@core/util/fireAndForget';
import CalendarPlusIcon from '@phosphor/calendar-plus.svg';
import CaretDownIcon from '@phosphor/caret-down.svg';
import DownloadSimpleIcon from '@phosphor/download-simple.svg';
import { useVisibleCalendarsQuery } from '@queries/calendar/calendars';
import {
  isAlreadyOnCalendar,
  isCopyRefused,
  useCopySharedCalendarEventMutation,
} from '@queries/calendar/copy';
import { queryReadyGate } from '@queries/gate';
import { Button, Dropdown } from '@ui';
import { createSignal, For, Show } from 'solid-js';

/**
 * Actions for a meeting the viewer sees only because it was shared with one
 * of their channels: add a snapshot of it to one of their Google calendars,
 * or download it for a calendar Macro does not write to.
 */
export function SharedEventActions(props: {
  /** The channel-shared event the mention names. */
  eventId: string;
  title: string;
  /** Called once the copy is on the viewer's calendar. */
  onAdded?: () => void;
}) {
  const addSharedEvent = useCalendarAddSharedEventFlag();
  const [menuOpen, setMenuOpen] = createSignal(false);
  // The calendar menu portals out of the hover card; keep the card open
  // while the viewer picks a calendar.
  useHoldParentHoverCardOpen(menuOpen);

  const calendars = useVisibleCalendarsQuery();
  // Only Google imports a copy under the meeting's own UID, which is what
  // lets the mention resolve to it. Reading `data` while the list is pending
  // would suspend the whole card; until it arrives there is nothing to pick.
  const targetCalendars = () =>
    (queryReadyGate(calendars) ? calendars.data : []).filter(
      (calendar) =>
        calendar.isWritable &&
        calendar.provider === 'google' &&
        !calendar.isSubscription
    );

  const copy = useCopySharedCalendarEventMutation({
    onSuccess: () => {
      toast.success('Added to your calendar');
      props.onAdded?.();
    },
    onError: (error) => {
      if (isAlreadyOnCalendar(error)) {
        toast.failure('This event is already on your calendar');
      } else if (isCopyRefused(error)) {
        toast.failure("Google Calendar won't add this event to that calendar", {
          subtext: 'Download the .ics file to add it another way.',
        });
      } else {
        toast.failure('Failed to add the event to your calendar');
      }
    },
  });
  const addToCalendar = (calendarId: string | undefined) =>
    copy.mutate({ eventId: props.eventId, calendarId });

  return (
    <div
      class="mt-1 flex flex-wrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Show when={addSharedEvent()}>
        <Show
          when={targetCalendars().length > 1}
          fallback={
            <Button
              variant="outline"
              size="xs"
              disabled={copy.isPending || targetCalendars().length === 0}
              onClick={() => addToCalendar(targetCalendars()[0]?.id)}
            >
              <CalendarPlusIcon />
              Add to calendar
            </Button>
          }
        >
          <Dropdown open={menuOpen()} onOpenChange={setMenuOpen}>
            <Dropdown.Trigger
              variant="outline"
              size="xs"
              disabled={copy.isPending}
            >
              <CalendarPlusIcon />
              Add to calendar
              <CaretDownIcon />
            </Dropdown.Trigger>
            <Dropdown.Content blockingBackdrop class="z-nested-action-menu">
              <Dropdown.Group>
                <For each={targetCalendars()}>
                  {(calendar) => (
                    <Dropdown.Item onSelect={() => addToCalendar(calendar.id)}>
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate">{calendar.name}</span>
                        <Show when={calendar.name !== calendar.emailAddress}>
                          <span class="truncate text-xs text-ink-muted">
                            {calendar.emailAddress}
                          </span>
                        </Show>
                      </span>
                    </Dropdown.Item>
                  )}
                </For>
              </Dropdown.Group>
            </Dropdown.Content>
          </Dropdown>
        </Show>
      </Show>
      <Button
        variant="ghost"
        size="xs"
        onClick={() =>
          fireAndForget(
            downloadCalendarEventIcs({
              eventId: props.eventId,
              title: props.title,
            }),
            'shared-event-actions'
          )
        }
      >
        <DownloadSimpleIcon />
        Download .ics
      </Button>
    </div>
  );
}
