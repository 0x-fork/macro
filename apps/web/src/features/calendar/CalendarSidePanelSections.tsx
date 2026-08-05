import {
  type CorrespondenceParty,
  CorrespondenceSidePanelSection,
  externalParties,
} from '@app/features/correspondence';
import { SidePanel, useSidePanel } from '@components/app/side-panel/SidePanel';
import { useEmail } from '@core/context/user';
import CloseIcon from '@phosphor/x.svg';
import { Button, Calendar as MiniCalendar } from '@ui';
import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { useCalendarView } from './CalendarViewContext';
import { CalendarControls } from './events/CalendarControls';
import { EventDetails } from './events/EventDetails';
import { useFullCalendar } from './fullcalendar-solid';

function CalendarEventSidePanelSection() {
  const calendarView = useCalendarView();
  const sidePanel = useSidePanel();

  createEffect(
    on(
      () => [calendarView.selectedEvent()?.id, sidePanel?.isNarrow()] as const,
      ([eventId, isNarrow]) => {
        if (!eventId || !sidePanel || isNarrow) return;

        sidePanel.setIsOpen(true);
        if (!sidePanel.openSectionIds().includes('calendar-event')) {
          sidePanel.setOpenSectionIds([
            ...sidePanel.openSectionIds(),
            'calendar-event',
          ]);
        }
      }
    )
  );

  return (
    <Show when={calendarView.selectedEvent()}>
      {(event) => (
        <SidePanel.Section
          id="calendar-event"
          title="Event"
          order={0}
          defaultOpen
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              label="Close event details"
              onClick={calendarView.closeEventDetails}
            >
              <CloseIcon class="size-3.5" />
            </Button>
          }
        >
          <EventDetails
            event={event()}
            timeFormat={calendarView.displaySettings.timeFormat}
          />
        </SidePanel.Section>
      )}
    </Show>
  );
}

function CalendarMiniCalendarSidePanelSection() {
  const calendarView = useCalendarView();
  const calendar = useFullCalendar();
  const initialDate = new Date();
  const [focusedDay, setFocusedDay] = createSignal(initialDate);

  const currentDate = createMemo(
    () => calendar.dateInfo()?.view.calendar.getDate() ?? initialDate
  );

  const highlightedRange = createMemo(() => {
    const dateInfo = calendar.dateInfo();
    return dateInfo?.view.type === 'timeGridWeek'
      ? { end: dateInfo.end, start: dateInfo.start }
      : undefined;
  });

  const selectDate = (date: Date | null) => {
    if (!date) return;
    setFocusedDay(date);
    calendar.api()?.gotoDate(date);
  };

  const navigateMonth = (month: Date) => {
    const focused = focusedDay();
    const targetDate =
      focused.getFullYear() === month.getFullYear() &&
      focused.getMonth() === month.getMonth()
        ? focused
        : month;
    setFocusedDay(targetDate);
    calendar.api()?.gotoDate(targetDate);
  };

  createEffect(on(currentDate, setFocusedDay));

  return (
    <SidePanel.Section
      id="calendar-mini-calendar"
      title="Calendar"
      order={10}
      defaultOpen
    >
      <MiniCalendar
        required
        fixedWeeks
        startOfWeek={calendarView.displaySettings.weekStartsOn}
        value={currentDate()}
        month={currentDate()}
        focusedDay={focusedDay()}
        highlightedRange={highlightedRange()}
        onMonthChange={navigateMonth}
        onFocusedDayChange={setFocusedDay}
        onValueChange={selectDate}
      />
    </SidePanel.Section>
  );
}

function CalendarSourcesSidePanelSection() {
  const calendarView = useCalendarView();

  return (
    <Show when={calendarView.sources().length > 1}>
      <SidePanel.Section
        id="calendar-controls"
        title="Calendars"
        order={20}
        defaultOpen
      >
        <CalendarControls
          sources={calendarView.sources()}
          isVisible={calendarView.isSourceVisible}
          onVisibilityChange={calendarView.setSourceVisibility}
        />
      </SidePanel.Section>
    </Show>
  );
}

/**
 * Correspondence for the selected event. Only present while an event is
 * selected, and (via the section itself) only when that event has external
 * parties on it.
 */
function CalendarCorrespondenceSidePanelSection() {
  const calendarView = useCalendarView();
  const currentUserEmail = useEmail();

  // The organizer plus every attendee. `isSelf` marks the connected account
  // on the event; `externalParties` drops it again by address, so a
  // provider that omits the flag still can't leak the user into the panel.
  const parties = createMemo<CorrespondenceParty[]>(() => {
    const event = calendarView.selectedEvent();
    if (!event) return [];

    const participants: CorrespondenceParty[] = [];
    if (event.organizerEmail) {
      participants.push({
        email: event.organizerEmail,
        name: event.organizerName,
      });
    }
    for (const attendee of event.attendees) {
      if (attendee.isSelf) continue;
      participants.push({
        email: attendee.email,
        name: attendee.displayName ?? undefined,
      });
    }
    return externalParties(participants, currentUserEmail());
  });

  return <CorrespondenceSidePanelSection parties={parties()} order={30} />;
}

/** Registers the calendar's contextual right-side panel sections. */
export function CalendarSidePanelSections() {
  const sidePanel = useSidePanel();

  return (
    <Show when={!sidePanel?.isNarrow()}>
      <CalendarEventSidePanelSection />
      <CalendarMiniCalendarSidePanelSection />
      <CalendarSourcesSidePanelSection />
      <CalendarCorrespondenceSidePanelSection />
    </Show>
  );
}
