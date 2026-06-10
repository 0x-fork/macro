import { SERVER_HOSTS } from '@core/constant/servers';
import type { ApiMessage } from '@service-email/generated/schemas';

/**
 * Path prefix of the email service's open-tracking (read receipt) pixel
 * endpoint. Outgoing tracked messages embed a 1x1 image at
 * `{email-service}/t/o/{token}`.
 */
const OPEN_TRACKING_PATH = '/t/o/';

function isMacroTrackingPixelUrl(src: string): boolean {
  if (!src.includes(OPEN_TRACKING_PATH)) return false;
  try {
    const url = new URL(src);
    if (!url.pathname.startsWith(OPEN_TRACKING_PATH)) return false;
    const emailServiceOrigin = new URL(SERVER_HOSTS['email-service']).origin;
    return (
      url.origin === emailServiceOrigin ||
      // Bodies synced across environments still point at a Macro email service.
      /^email-service[a-z0-9.-]*\.macro\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Removes Macro open-tracking pixels from a rendered email body. Applied to
 * sent copies so that viewing (or quoting) your own tracked mail never records
 * an open against yourself. Received messages keep their pixels.
 */
export function removeOwnTrackingPixels(root: ParentNode): void {
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (isMacroTrackingPixelUrl(src)) img.remove();
  }
}

/**
 * When this copy of a message was sent from the viewer's inbox and a recipient
 * has opened it, returns the most recent open time. Otherwise undefined.
 */
export function messageSeenAt(message: ApiMessage): Date | undefined {
  if (!message.is_sent || message.is_draft) return undefined;
  if (!message.open_count || !message.last_opened_at) return undefined;
  return new Date(message.last_opened_at);
}

/** Compact "Seen …" label for read receipt indicators, e.g. "Seen 2h ago". */
export function formatSeenLabel(seenAt: Date): string {
  const minutes = Math.floor((Date.now() - seenAt.getTime()) / 60_000);
  if (minutes < 1) return 'Seen just now';
  if (minutes < 60) return `Seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Seen ${days}d ago`;
  return `Seen ${seenAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

/** Full read receipt detail for tooltips. */
export function formatSeenTooltip(message: ApiMessage): string {
  const opens = message.open_count ?? 0;
  const first = message.first_opened_at
    ? new Date(message.first_opened_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined;
  const times = opens === 1 ? 'once' : `${opens} times`;
  return first ? `Opened ${times} · First seen ${first}` : `Opened ${times}`;
}
