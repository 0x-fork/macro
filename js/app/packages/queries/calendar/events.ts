import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { calendarClient } from '@service-calendar/client';
import type {
  CalendarEvent,
  CreateEventRequest,
  UpdateEventRequest,
} from '@service-calendar/generated/schemas';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { calendarKeys } from './keys';

const QUERY_REFETCH_BEHAVIOR = {
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
};

export interface CalendarRange {
  startMs: number;
  endMs: number;
}

/** Reactive list of the user's events intersecting `range()`. */
export function useCalendarEventsQuery(
  range: Accessor<CalendarRange>,
  enabled: Accessor<boolean>
) {
  return useQuery(() => {
    const { startMs, endMs } = range();
    return {
      queryKey: calendarKeys.range({ startMs, endMs }).queryKey,
      enabled: enabled(),
      queryFn: async () =>
        throwOnErr(async () => await calendarClient.listEvents({ startMs, endMs })),
      placeholderData: (prev: CalendarEvent[] | undefined) => prev,
      reconcile: 'id',
      ...QUERY_REFETCH_BEHAVIOR,
    };
  });
}

/** Invalidates every cached calendar range so views refetch after a write. */
export function invalidateCalendar() {
  return queryClient.invalidateQueries({ queryKey: calendarKeys._def });
}

export function useCreateEventMutation(
  callbacks?: MutationCallbacks<CalendarEvent, Error, CreateEventRequest>
) {
  return useMutation(() => ({
    mutationFn: async (request: CreateEventRequest) =>
      throwOnErr(async () => await calendarClient.createEvent(request)),
    ...withCallbacks(
      {
        onSuccess: async () => {
          await invalidateCalendar();
        },
      },
      callbacks
    ),
  }));
}

export function useUpdateEventMutation(
  callbacks?: MutationCallbacks<
    CalendarEvent,
    Error,
    { id: string; body: UpdateEventRequest }
  >
) {
  return useMutation(() => ({
    mutationFn: async (args: { id: string; body: UpdateEventRequest }) =>
      throwOnErr(async () => await calendarClient.updateEvent(args)),
    ...withCallbacks(
      {
        onSuccess: async () => {
          await invalidateCalendar();
        },
      },
      callbacks
    ),
  }));
}

export function useDeleteEventMutation(
  callbacks?: MutationCallbacks<{ success: boolean }, Error, { id: string }>
) {
  return useMutation(() => ({
    mutationFn: async (args: { id: string }) =>
      throwOnErr(async () => await calendarClient.deleteEvent(args)),
    ...withCallbacks(
      {
        onSuccess: async () => {
          await invalidateCalendar();
        },
      },
      callbacks
    ),
  }));
}

export function useInviteAttendeesMutation(
  callbacks?: MutationCallbacks<
    CalendarEvent,
    Error,
    { id: string; emails: string[] }
  >
) {
  return useMutation(() => ({
    mutationFn: async (args: { id: string; emails: string[] }) =>
      throwOnErr(async () => await calendarClient.inviteAttendees(args)),
    ...withCallbacks(
      {
        onSuccess: async () => {
          await invalidateCalendar();
        },
      },
      callbacks
    ),
  }));
}
