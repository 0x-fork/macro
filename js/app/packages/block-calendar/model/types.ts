/**
 * Frontend domain types for the calendar block.
 *
 * These are intentionally decoupled from the wire/API types (which live in
 * `@service-calendar`). Queries map between the two so the UI works with a
 * clean, instant-based model.
 */

/** The three calendar surfaces, mirroring Google Calendar. */
export type CalendarViewMode = 'week' | 'day' | 'list';

export const CALENDAR_VIEW_MODES: CalendarViewMode[] = ['week', 'day', 'list'];

/** Accent palette for events. Keys map to semantic-ish token classes in the UI. */
export type EventColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'red'
  | 'pink';

export const EVENT_COLORS: EventColor[] = [
  'blue',
  'green',
  'purple',
  'orange',
  'red',
  'pink',
];

/** RSVP state of an invitee. */
export type AttendeeStatus = 'pending' | 'accepted' | 'declined' | 'tentative';

export interface CalendarAttendee {
  email: string;
  name?: string;
  status: AttendeeStatus;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  /** Start instant, epoch milliseconds (UTC). */
  startMs: number;
  /** End instant, epoch milliseconds (UTC). */
  endMs: number;
  allDay: boolean;
  attendees: CalendarAttendee[];
  color: EventColor;
}

/** Shape used by the create/edit form before it becomes a persisted event. */
export interface CalendarEventDraft {
  id?: string;
  title: string;
  description: string;
  location: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  attendees: CalendarAttendee[];
  color: EventColor;
}

export function isEventColor(value: string): value is EventColor {
  return (EVENT_COLORS as string[]).includes(value);
}
