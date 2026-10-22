/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createMemo } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@components/app/split-layout/split-router/mention-links', () => ({
  useMacroMentionLinkResolver: () => () => undefined,
}));
vi.mock(
  '@core/component/LexicalMarkdown/component/core/MarkdownTextarea',
  () => ({ MarkdownTextarea: () => null })
);
vi.mock('@property/editors/selectors/PropertyEntitySelector', () => ({
  PropertyEntitySelector: () => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Search for guests');
    return input;
  },
}));

import { createCalendarEventFormController } from './create-calendar-event-form-controller';
import { EventForm } from './EventForm';
import type { EventEditorCalendarOption } from './event-form-model';

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const WORK_CALENDAR: EventEditorCalendarOption = {
  id: 'work-calendar',
  provider: 'google',
  capabilities: {
    autoDecline: true,
    emailReminders: true,
    customRecurrence: false,
    removeConference: false,
    resetRsvp: false,
    conferenceProvider: 'google_meet',
  },
  label: 'Work',
  color: '#123456',
  defaultReminders: [],
  isPrimary: true,
};

/** Renders the form and counts the edits it reports back to its host. */
function showForm() {
  const edits = { count: 0 };
  render(() => {
    const calendarOptions = createMemo(() => [WORK_CALENDAR]);
    const controller = createCalendarEventFormController({
      initialValue: {
        title: 'Customer demo',
        allDay: false,
        start: '2030-01-01T12:00',
        end: '2030-01-01T13:00',
        recurrenceLines: [],
        guests: '',
        location: '',
        description: '',
        conference: 'none',
        calendarId: WORK_CALENDAR.id,
      },
      calendarOptions,
      guestOptions: () => [],
      onChange: () => {
        edits.count += 1;
        // An edit loop overflows the stack and takes the app down with it, so
        // fail the test instead of hanging it.
        if (edits.count > 50) throw new Error('the event form never settled');
      },
    });
    return (
      <EventForm
        controller={controller}
        macroCallsEnabled
        pending={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
  });
  return edits;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', ObserverStub);
  vi.stubGlobal('IntersectionObserver', ObserverStub);
  vi.stubGlobal('scrollTo', vi.fn() as unknown as typeof window.scrollTo);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('settles after a typed title instead of editing itself', async () => {
  const user = userEvent.setup();
  const edits = showForm();
  await user.type(screen.getByLabelText('Title'), 'ab');
  expect(screen.getByLabelText('Title')).toHaveProperty(
    'value',
    'Customer demoab'
  );
  expect(edits.count).toBeLessThan(10);
});

it('settles after a Macro call is picked', async () => {
  const user = userEvent.setup();
  const edits = showForm();
  const trigger = screen.getByRole('button', { name: /Video conferencing/ });
  await user.click(trigger);
  await user.click(screen.getByRole('option', { name: 'Macro call' }));
  expect(trigger.textContent).toContain('Macro call');
  expect(edits.count).toBeLessThan(10);
});
