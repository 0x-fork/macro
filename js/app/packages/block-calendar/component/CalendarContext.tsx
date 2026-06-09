import { createAssertedContextProvider } from '@core/context/createContext';
import { useUserContext } from '@core/context/user';
import {
  type CalendarRange,
  useCalendarEventsQuery,
  useCreateEventMutation,
  useDeleteEventMutation,
  useInviteAttendeesMutation,
  useUpdateEventMutation,
} from '@queries/calendar/events';
import type { CalendarEvent as WireEvent } from '@service-calendar/generated/schemas';
import { endOfDay, startOfDay } from 'date-fns';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import {
  type AttendeeStatus,
  type CalendarEvent,
  type CalendarEventDraft,
  type CalendarViewMode,
  isEventColor,
} from '../model/types';
import { DEFAULT_EVENT_MINUTES, daysForView, shiftAnchor } from '../util/dates';
import { sendInviteEmail } from '../util/invite';

function toDomain(event: WireEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    startMs: event.start_ms,
    endMs: event.end_ms,
    allDay: event.all_day,
    color: isEventColor(event.color) ? event.color : 'blue',
    attendees: event.attendees.map((a) => ({
      email: a.email,
      name: a.name ?? undefined,
      status: (a.status as AttendeeStatus) ?? 'pending',
    })),
  };
}

function draftToRequest(draft: CalendarEventDraft) {
  return {
    title: draft.title.trim() || 'Untitled event',
    description: draft.description.trim() || null,
    location: draft.location.trim() || null,
    start_ms: draft.startMs,
    end_ms: draft.endMs,
    all_day: draft.allDay,
    color: draft.color,
    attendees: draft.attendees.map((a) => ({
      email: a.email,
      name: a.name ?? null,
    })),
  };
}

function eventToDraft(event: CalendarEvent): CalendarEventDraft {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    startMs: event.startMs,
    endMs: event.endMs,
    allDay: event.allDay,
    attendees: [...event.attendees],
    color: event.color,
  };
}

function newDraft(startMs: number): CalendarEventDraft {
  return {
    title: '',
    description: '',
    location: '',
    startMs,
    endMs: startMs + DEFAULT_EVENT_MINUTES * 60 * 1000,
    allDay: false,
    attendees: [],
    color: 'blue',
  };
}

export const [CalendarProvider, useCalendar] = createAssertedContextProvider(
  'Calendar',
  () => {
    const user = useUserContext();

    const [view, setView] = createSignal<CalendarViewMode>('week');
    const [anchor, setAnchor] = createSignal<Date>(new Date());
    const [editingDraft, setEditingDraft] =
      createSignal<CalendarEventDraft | null>(null);

    const range = createMemo<CalendarRange>(() => {
      const days = daysForView(view(), anchor());
      return {
        startMs: startOfDay(days[0]!).getTime(),
        endMs: endOfDay(days[days.length - 1]!).getTime(),
      };
    });

    const eventsQuery = useCalendarEventsQuery(range, () => true);

    const events = createMemo<CalendarEvent[]>(() =>
      (eventsQuery.data ?? []).map(toDomain)
    );

    const createMutation = useCreateEventMutation();
    const updateMutation = useUpdateEventMutation();
    const deleteMutation = useDeleteEventMutation();
    const inviteMutation = useInviteAttendeesMutation();

    const goToday = () => setAnchor(new Date());
    const goPrev = () => setAnchor((d) => shiftAnchor(view(), d, -1));
    const goNext = () => setAnchor((d) => shiftAnchor(view(), d, 1));

    const openNew = (startMs?: number) =>
      setEditingDraft(newDraft(startMs ?? Date.now()));
    const openEdit = (event: CalendarEvent) =>
      setEditingDraft(eventToDraft(event));
    const closeEditor = () => setEditingDraft(null);

    /** Persists the current draft (create or update) and returns the saved event. */
    const saveDraft = async (
      draft: CalendarEventDraft
    ): Promise<CalendarEvent> => {
      const body = draftToRequest(draft);
      const saved = draft.id
        ? await updateMutation.mutateAsync({ id: draft.id, body })
        : await createMutation.mutateAsync(body);
      return toDomain(saved);
    };

    const removeEvent = async (id: string) => {
      await deleteMutation.mutateAsync({ id });
    };

    /**
     * Records invites on the backend and emails attendees from the user's
     * connected mailbox. Returns the email-service result.
     */
    const sendInvites = async (event: CalendarEvent, emails: string[]) => {
      await inviteMutation.mutateAsync({ id: event.id, emails });
      const recipients = event.attendees
        .filter((a) => emails.includes(a.email))
        .map((a) => ({ email: a.email, name: a.name }));
      return sendInviteEmail({
        event,
        organizerEmail: user.email() ?? '',
        organizerName: user.author(),
        recipients: recipients.length > 0 ? recipients : undefined,
      });
    };

    return {
      view,
      setView,
      anchor,
      setAnchor,
      range,
      events,
      isLoading: () => eventsQuery.isLoading,
      editingDraft: editingDraft as Accessor<CalendarEventDraft | null>,
      setEditingDraft,
      goToday,
      goPrev,
      goNext,
      openNew,
      openEdit,
      closeEditor,
      saveDraft,
      removeEvent,
      sendInvites,
      organizerEmail: () => user.email() ?? '',
      organizerName: () => user.author(),
    };
  }
);
