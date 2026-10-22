/**
 * @vitest-environment jsdom
 */

import type { VisibleCalendar } from '@service-calendar/generated/schemas/visibleCalendar';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedEventActions } from './SharedEventActions';

const mocks = vi.hoisted(() => ({
  calendars: [] as VisibleCalendar[],
  copy: vi.fn(),
  download: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
}));

vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: mocks.success, failure: mocks.failure },
}));
vi.mock('@app/features/calendar-view/download-event-ics', () => ({
  downloadCalendarEventIcs: mocks.download,
}));
vi.mock('@queries/calendar/calendars', () => ({
  useVisibleCalendarsQuery: () => ({ isPending: false, data: mocks.calendars }),
}));
// The mutation's transport and cache invalidation are covered with the
// query; here it answers with whatever `mocks.copy` returns or throws.
vi.mock('@queries/calendar/copy', () => ({
  isAlreadyOnCalendar: (error: unknown) =>
    (error as { code?: string }).code === 'already_on_calendar',
  useCopySharedCalendarEventMutation: (callbacks?: {
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  }) => ({
    isPending: false,
    mutate: (args: { eventId: string; calendarId?: string }) => {
      try {
        mocks.copy(args);
        callbacks?.onSuccess?.();
      } catch (error) {
        callbacks?.onError?.(error);
      }
    },
  }),
}));

function calendar(overrides: Partial<VisibleCalendar>): VisibleCalendar {
  return {
    id: 'calendar-primary',
    emailLinkId: 'link-1',
    emailAddress: 'member@example.com',
    name: 'member@example.com',
    provider: 'google',
    capabilities: {
      autoDecline: true,
      customRecurrence: true,
      emailReminders: true,
      removeConference: true,
      resetRsvp: true,
    },
    color: null,
    isPrimary: true,
    isWritable: true,
    isSubscription: false,
    syncError: null,
    defaultReminders: [],
    ...overrides,
  };
}

function renderActions(onAdded = vi.fn()) {
  render(() => (
    <SharedEventActions
      eventId="shared-event"
      title="Design review"
      onAdded={onAdded}
    />
  ));
  return onAdded;
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('scrollTo', vi.fn());
  mocks.calendars = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('shared event actions', () => {
  it('adds the event to the only Google calendar the viewer can write to', () => {
    mocks.calendars = [
      calendar({}),
      calendar({ id: 'holidays', isWritable: false, isSubscription: true }),
      calendar({ id: 'outlook', provider: 'outlook', isPrimary: false }),
    ];
    const onAdded = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(mocks.copy).toHaveBeenCalledWith({
      eventId: 'shared-event',
      calendarId: 'calendar-primary',
    });
    expect(onAdded).toHaveBeenCalledOnce();
  });

  it('lets the viewer pick among several Google calendars', async () => {
    mocks.calendars = [
      calendar({}),
      calendar({
        id: 'calendar-team',
        name: 'Team',
        isPrimary: false,
      }),
      calendar({ id: 'outlook', name: 'Outlook', provider: 'outlook' }),
    ];
    renderActions();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Add to calendar' }), {
      key: 'Enter',
    });
    const options = await screen.findAllByRole('menuitem');
    expect(options.map((option) => option.textContent)).toEqual([
      'member@example.com',
      'Teammember@example.com',
    ]);
    fireEvent.keyDown(options[1], { key: 'Enter' });

    expect(mocks.copy).toHaveBeenCalledWith({
      eventId: 'shared-event',
      calendarId: 'calendar-team',
    });
  });

  it('cannot add without a writable Google calendar but can still download', () => {
    mocks.calendars = [calendar({ provider: 'outlook' })];
    renderActions();

    const add = screen.getByRole('button', { name: 'Add to calendar' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Download .ics' }));
    expect(mocks.download).toHaveBeenCalledWith({
      eventId: 'shared-event',
      title: 'Design review',
    });
  });

  it('says so when the meeting is already on a calendar', () => {
    mocks.calendars = [calendar({})];
    mocks.copy.mockImplementation(() => {
      throw { code: 'already_on_calendar' };
    });
    const onAdded = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(mocks.failure).toHaveBeenCalledWith(
      'This event is already on your calendar'
    );
    expect(onAdded).not.toHaveBeenCalled();
  });
});
