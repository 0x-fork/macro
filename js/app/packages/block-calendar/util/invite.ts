/**
 * Sends event invites through the user's connected mailbox (email-service),
 * so attendees receive a real email from the organizer. The backend separately
 * records invite state via the calendar service.
 */
import { emailClient } from '@service-email/client';
import { format } from 'date-fns';
import type { CalendarEvent } from '../model/types';
import { buildIcs } from './ics';

/** Encode a UTF-8 string as base64 URL_SAFE_NO_PAD (the email API's body_html format). */
function encodeBodyHtml(html: string): string {
  return btoa(unescape(encodeURIComponent(html)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/={1,}$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function whenLabel(event: CalendarEvent): string {
  if (event.allDay) {
    return format(event.startMs, 'EEEE, MMMM d, yyyy');
  }
  return `${format(event.startMs, 'EEEE, MMMM d, yyyy')} · ${format(
    event.startMs,
    'h:mm a'
  )} – ${format(event.endMs, 'h:mm a')}`;
}

function buildHtmlBody(
  event: CalendarEvent,
  organizerName: string,
  ics: string
): string {
  const rows: string[] = [
    `<h2 style="margin:0 0 12px">${escapeHtml(event.title || 'Untitled event')}</h2>`,
    `<p style="margin:4px 0"><strong>When:</strong> ${escapeHtml(whenLabel(event))}</p>`,
  ];
  if (event.location) {
    rows.push(
      `<p style="margin:4px 0"><strong>Where:</strong> ${escapeHtml(event.location)}</p>`
    );
  }
  if (event.description) {
    rows.push(
      `<p style="margin:12px 0;white-space:pre-wrap">${escapeHtml(event.description)}</p>`
    );
  }
  rows.push(
    `<p style="margin:16px 0 4px;color:#666">Invited by ${escapeHtml(organizerName)}.</p>`,
    // Embed the iCalendar component so calendar-aware clients can import it.
    `<pre style="display:none">${escapeHtml(ics)}</pre>`
  );
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">${rows.join('')}</div>`;
}

function buildTextBody(event: CalendarEvent, organizerName: string): string {
  const lines = [event.title || 'Untitled event', `When: ${whenLabel(event)}`];
  if (event.location) lines.push(`Where: ${event.location}`);
  if (event.description) lines.push('', event.description);
  lines.push('', `Invited by ${organizerName}.`);
  return lines.join('\n');
}

export interface SendInviteArgs {
  event: CalendarEvent;
  organizerEmail: string;
  organizerName: string;
  /** Recipients to email; defaults to all attendees on the event. */
  recipients?: { email: string; name?: string }[];
}

/**
 * Sends the invite email. Returns the email-service result so callers can
 * surface success/failure. Throws only on programmer error (no recipients).
 */
export async function sendInviteEmail(args: SendInviteArgs) {
  const recipients =
    args.recipients ??
    args.event.attendees.map((a) => ({ email: a.email, name: a.name }));

  const ics = buildIcs(args.event, {
    organizerEmail: args.organizerEmail,
    organizerName: args.organizerName,
    method: 'REQUEST',
  });

  const html = buildHtmlBody(args.event, args.organizerName, ics);
  const text = buildTextBody(args.event, args.organizerName);

  return emailClient.sendMessage({
    message: {
      subject: `Invitation: ${args.event.title || 'Untitled event'}`,
      to: recipients.map((r) => ({ email: r.email, name: r.name })),
      body_html: encodeBodyHtml(html),
      body_text: text,
    },
  });
}
