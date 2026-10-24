/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { MacroToolCall } from './MacroToolCall';
import type { ToolCallContext } from './shared';

vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: false }),
}));

const context: ToolCallContext = {
  sessionId: 'session',
  messageId: 'session:0:agent',
  partIndex: 0,
  inFlight: false,
  followedBy: () => false,
};

describe('MacroToolCall failures', () => {
  it('shows a failed call on its own card and reveals the reason on request', () => {
    const reason =
      'The calendar event no longer exists: it was deleted or cancelled, or the id is not a calendar event.';
    render(() => (
      <MacroToolCall
        detail={{
          kind: 'macro',
          input: { eventId: '01a16cb6-0000-7000-8000-00000000dead' },
          output: reason,
          error: reason,
        }}
        common={{
          id: 'call-1',
          label: 'ReadCalendarEvent',
          status: 'failed',
          muted: true,
          trailing: 'Failed',
        }}
        context={context}
      />
    ));

    expect(screen.getByText('Read calendar event')).toBeTruthy();
    expect(screen.queryByText('ReadCalendarEvent')).toBeNull();
    expect(screen.queryByText(reason)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(screen.getByText(reason)).toBeTruthy();
  });
});
