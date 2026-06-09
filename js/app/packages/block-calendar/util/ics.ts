/**
 * Minimal RFC-5545 iCalendar generation for event invites.
 *
 * The backend owns authoritative invite delivery, but we also generate a
 * client-side `.ics` so the organizer can download/attach the invite and so the
 * email body can embed a standards-compliant calendar component.
 */
import type { CalendarEvent } from '../model/types';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format an epoch-ms instant as a UTC iCal timestamp (e.g. 20260612T143000Z). */
export function toIcsUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape per RFC-5545 §3.3.11 (commas, semicolons, backslashes, newlines). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long content lines to 75 octets per RFC-5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join('\r\n');
}

export interface IcsOptions {
  organizerEmail: string;
  organizerName?: string;
  /** PUBLISH for informational, REQUEST when soliciting RSVPs. */
  method?: 'REQUEST' | 'PUBLISH' | 'CANCEL';
}

export function buildIcs(event: CalendarEvent, opts: IcsOptions): string {
  const method = opts.method ?? 'REQUEST';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Macro//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${event.id}@macro.com`,
    `DTSTAMP:${toIcsUtc(Date.now())}`,
    `DTSTART:${toIcsUtc(event.startMs)}`,
    `DTEND:${toIcsUtc(event.endMs)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  const organizerCn = opts.organizerName ?? opts.organizerEmail;
  lines.push(`ORGANIZER;CN=${escapeText(organizerCn)}:mailto:${opts.organizerEmail}`);

  for (const attendee of event.attendees) {
    const cn = escapeText(attendee.name ?? attendee.email);
    lines.push(
      `ATTENDEE;CN=${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`
    );
  }

  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}

/** Trigger a browser download of the event as an `.ics` file. */
export function downloadIcs(event: CalendarEvent, opts: IcsOptions): void {
  const ics = buildIcs(event, opts);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const safeName = event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event';
  anchor.download = `${safeName}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
