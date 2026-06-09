import { SERVER_HOSTS } from '@core/constant/servers';
import {
  type FetchWithTokenErrorCode,
  fetchWithToken,
} from '@core/util/fetchWithToken';
import type { ObjectLike, ResultError } from '@core/util/result';
import type { SafeFetchInit } from '@core/util/safeFetch';
import type { Result } from 'neverthrow';
import type {
  CalendarEvent,
  CreateEventRequest,
  UpdateEventRequest,
} from './generated/schemas';

const calendarHost: string = SERVER_HOSTS['calendar-service'];

function calendarFetch(
  url: string,
  init?: SafeFetchInit
): Promise<Result<void, ResultError<FetchWithTokenErrorCode>[]>>;
function calendarFetch<T extends ObjectLike>(
  url: string,
  init?: SafeFetchInit
): Promise<Result<T, ResultError<FetchWithTokenErrorCode>[]>>;
function calendarFetch<T extends ObjectLike = never>(
  url: string,
  init?: SafeFetchInit
):
  | Promise<Result<T, ResultError<FetchWithTokenErrorCode>[]>>
  | Promise<Result<void, ResultError<FetchWithTokenErrorCode>[]>> {
  return fetchWithToken<T>(`${calendarHost}${url}`, init);
}

export const calendarClient = {
  listEvents: async (args: { startMs: number; endMs: number }) =>
    calendarFetch<CalendarEvent[]>(
      `/calendar/events?start_ms=${args.startMs}&end_ms=${args.endMs}`,
      { method: 'GET' }
    ),

  getEvent: async (args: { id: string }) =>
    calendarFetch<CalendarEvent>(`/calendar/events/${args.id}`, {
      method: 'GET',
    }),

  createEvent: async (body: CreateEventRequest) =>
    calendarFetch<CalendarEvent>('/calendar/events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateEvent: async (args: { id: string; body: UpdateEventRequest }) =>
    calendarFetch<CalendarEvent>(`/calendar/events/${args.id}`, {
      method: 'PUT',
      body: JSON.stringify(args.body),
    }),

  deleteEvent: async (args: { id: string }) => {
    const result = await calendarFetch<Record<string, never>>(
      `/calendar/events/${args.id}`,
      { method: 'DELETE' }
    );
    return result.map(() => ({ success: true }));
  },

  inviteAttendees: async (args: { id: string; emails: string[] }) =>
    calendarFetch<CalendarEvent>(`/calendar/events/${args.id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails: args.emails }),
    }),
};
