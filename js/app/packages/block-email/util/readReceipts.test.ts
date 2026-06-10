import type { ApiMessage } from '@service-email/generated/schemas';
import { describe, expect, it } from 'vitest';
import {
  formatSeenLabel,
  messageSeenAt,
  removeOwnTrackingPixels,
} from './readReceipts';

// Not a real UUID — the pixel URL matcher keys off host + path, not token
// shape — and a non-UUID literal keeps secret scanners quiet.
const TOKEN = 'open-tracking-token-test';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('removeOwnTrackingPixels', () => {
  it('removes pixels pointing at a macro email service', () => {
    const doc = parse(
      `<p>hi</p>` +
        `<img src="https://email-service.macro.com/t/o/${TOKEN}" width="1" height="1">` +
        `<img src="https://email-service-dev.macro.com/t/o/${TOKEN}" width="1" height="1">`
    );

    removeOwnTrackingPixels(doc);

    expect(doc.querySelectorAll('img').length).toBe(0);
    expect(doc.body.textContent).toContain('hi');
  });

  it('keeps regular images and lookalike third-party pixels', () => {
    const doc = parse(
      `<img src="https://example.com/logo.png">` +
        `<img src="https://tracker.example.com/t/o/${TOKEN}">` +
        `<img src="not a url">`
    );

    removeOwnTrackingPixels(doc);

    expect(doc.querySelectorAll('img').length).toBe(3);
  });
});

describe('messageSeenAt', () => {
  const baseMessage = {
    is_sent: true,
    is_draft: false,
    open_count: 2,
    first_opened_at: '2026-06-10T10:00:00Z',
    last_opened_at: '2026-06-10T12:00:00Z',
  } as ApiMessage;

  it('returns the last open time for opened sent messages', () => {
    expect(messageSeenAt(baseMessage)?.toISOString()).toBe(
      '2026-06-10T12:00:00.000Z'
    );
  });

  it('returns undefined for unopened, received, or draft messages', () => {
    expect(
      messageSeenAt({ ...baseMessage, open_count: 0 } as ApiMessage)
    ).toBeUndefined();
    expect(
      messageSeenAt({ ...baseMessage, is_sent: false } as ApiMessage)
    ).toBeUndefined();
    expect(
      messageSeenAt({ ...baseMessage, is_draft: true } as ApiMessage)
    ).toBeUndefined();
  });
});

describe('formatSeenLabel', () => {
  it('formats recent opens relative to now', () => {
    expect(formatSeenLabel(new Date())).toBe('Seen just now');
    expect(formatSeenLabel(new Date(Date.now() - 5 * 60_000))).toBe(
      'Seen 5m ago'
    );
    expect(formatSeenLabel(new Date(Date.now() - 3 * 3_600_000))).toBe(
      'Seen 3h ago'
    );
    expect(formatSeenLabel(new Date(Date.now() - 2 * 86_400_000))).toBe(
      'Seen 2d ago'
    );
  });
});
