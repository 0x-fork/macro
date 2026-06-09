import DownloadIcon from '@phosphor/download-simple.svg';
import SendIcon from '@phosphor/paper-plane-tilt.svg';
import TrashIcon from '@phosphor/trash.svg';
import XIcon from '@phosphor/x.svg';
import { Button, cn, Dialog } from '@ui';
import { createSignal, For, Show } from 'solid-js';
import {
  type CalendarEvent,
  type CalendarEventDraft,
  EVENT_COLORS,
} from '../model/types';
import {
  DEFAULT_EVENT_MINUTES,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from '../util/dates';
import { downloadIcs } from '../util/ics';
import { useCalendar } from './CalendarContext';
import { EVENT_COLOR_CLASSES } from './colors';

const FIELD =
  'w-full rounded-xs border border-edge-muted bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-extra-muted focus:border-accent focus:outline-none';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Builds a CalendarEvent view of the in-progress draft for ICS export. */
function draftToEvent(draft: CalendarEventDraft): CalendarEvent {
  return {
    id: draft.id ?? 'draft',
    title: draft.title,
    description: draft.description || undefined,
    location: draft.location || undefined,
    startMs: draft.startMs,
    endMs: draft.endMs,
    allDay: draft.allDay,
    attendees: draft.attendees,
    color: draft.color,
  };
}

export function EventDialog() {
  const calendar = useCalendar();
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [attendeeInput, setAttendeeInput] = createSignal('');

  const draft = () => calendar.editingDraft();

  const update = (patch: Partial<CalendarEventDraft>) =>
    calendar.setEditingDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const setStart = (value: string) => {
    const startMs = fromDatetimeLocalValue(value);
    const current = draft();
    if (!current) return;
    const endMs =
      startMs >= current.endMs
        ? startMs + DEFAULT_EVENT_MINUTES * 60 * 1000
        : current.endMs;
    update({ startMs, endMs });
  };

  const addAttendee = () => {
    const email = attendeeInput().trim().toLowerCase();
    const current = draft();
    if (!current) return;
    if (!EMAIL_RE.test(email)) {
      setFeedback('Enter a valid email address');
      return;
    }
    if (current.attendees.some((a) => a.email === email)) {
      setAttendeeInput('');
      return;
    }
    setFeedback(null);
    update({ attendees: [...current.attendees, { email, status: 'pending' }] });
    setAttendeeInput('');
  };

  const removeAttendee = (email: string) => {
    const current = draft();
    if (!current) return;
    update({ attendees: current.attendees.filter((a) => a.email !== email) });
  };

  const close = () => {
    setFeedback(null);
    setAttendeeInput('');
    calendar.closeEditor();
  };

  const onSave = async () => {
    const current = draft();
    if (!current) return;
    setBusy(true);
    try {
      await calendar.saveDraft(current);
      close();
    } catch {
      setFeedback('Failed to save event');
    } finally {
      setBusy(false);
    }
  };

  const onSaveAndInvite = async () => {
    const current = draft();
    if (!current) return;
    setBusy(true);
    try {
      const saved = await calendar.saveDraft(current);
      const emails = saved.attendees.map((a) => a.email);
      if (emails.length > 0) {
        const result = await calendar.sendInvites(saved, emails);
        if (result.isErr()) {
          setFeedback('Event saved, but invites could not be sent');
          setBusy(false);
          return;
        }
      }
      close();
    } catch {
      setFeedback('Failed to save event');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const current = draft();
    if (!current?.id) return;
    setBusy(true);
    try {
      await calendar.removeEvent(current.id);
      close();
    } catch {
      setFeedback('Failed to delete event');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={draft() !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      position="center"
      class="rounded-md border border-edge-muted bg-surface shadow-lg"
    >
      <Show when={draft()}>
        {(currentDraft) => (
          <div class="flex max-h-[80vh] flex-col">
            <div class="flex items-center justify-between border-b border-edge-muted px-4 py-2.5">
              <Dialog.Title class="text-sm font-semibold text-ink">
                {currentDraft().id ? 'Edit event' : 'New event'}
              </Dialog.Title>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={close}
                class="[&_svg]:size-4"
              >
                <XIcon />
              </Button>
            </div>

            <div class="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <input
                class={cn(FIELD, 'text-base font-medium')}
                placeholder="Add title"
                value={currentDraft().title}
                onInput={(e) => update({ title: e.currentTarget.value })}
              />

              <label class="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={currentDraft().allDay}
                  onChange={(e) => update({ allDay: e.currentTarget.checked })}
                />
                All day
              </label>

              <div class="flex flex-wrap gap-2">
                <label class="flex flex-col gap-1 text-xs text-ink-muted">
                  Starts
                  <input
                    type="datetime-local"
                    class={cn(FIELD, 'w-auto')}
                    value={toDatetimeLocalValue(currentDraft().startMs)}
                    onChange={(e) => setStart(e.currentTarget.value)}
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-ink-muted">
                  Ends
                  <input
                    type="datetime-local"
                    class={cn(FIELD, 'w-auto')}
                    value={toDatetimeLocalValue(currentDraft().endMs)}
                    onChange={(e) =>
                      update({
                        endMs: fromDatetimeLocalValue(e.currentTarget.value),
                      })
                    }
                  />
                </label>
              </div>

              <input
                class={FIELD}
                placeholder="Add location or link"
                value={currentDraft().location}
                onInput={(e) => update({ location: e.currentTarget.value })}
              />

              <textarea
                class={cn(FIELD, 'min-h-20 resize-y')}
                placeholder="Add description"
                value={currentDraft().description}
                onInput={(e) => update({ description: e.currentTarget.value })}
              />

              {/* Color */}
              <div class="flex items-center gap-2">
                <span class="text-xs text-ink-muted">Color</span>
                <For each={EVENT_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      aria-label={color}
                      class={cn(
                        'size-5 rounded-full',
                        EVENT_COLOR_CLASSES[color].swatch,
                        currentDraft().color === color &&
                          'ring-2 ring-offset-1 ring-offset-surface ring-ink'
                      )}
                      onClick={() => update({ color })}
                    />
                  )}
                </For>
              </div>

              {/* Attendees */}
              <div class="space-y-1.5">
                <span class="text-xs text-ink-muted">Guests</span>
                <div class="flex gap-2">
                  <input
                    class={FIELD}
                    type="email"
                    placeholder="guest@example.com"
                    value={attendeeInput()}
                    onInput={(e) => setAttendeeInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAttendee();
                      }
                    }}
                  />
                  <Button variant="base" size="sm" onClick={addAttendee}>
                    Add
                  </Button>
                </div>
                <For each={currentDraft().attendees}>
                  {(attendee) => (
                    <div class="flex items-center justify-between rounded-xs bg-hover/50 px-2 py-1 text-sm">
                      <span class="min-w-0 truncate text-ink">
                        {attendee.name ? `${attendee.name} · ` : ''}
                        {attendee.email}
                      </span>
                      <div class="flex items-center gap-2">
                        <Show when={attendee.status !== 'pending'}>
                          <span class="text-xs capitalize text-ink-muted">
                            {attendee.status}
                          </span>
                        </Show>
                        <button
                          type="button"
                          aria-label="Remove guest"
                          class="text-ink-extra-muted hover:text-ink [&_svg]:size-3.5"
                          onClick={() => removeAttendee(attendee.email)}
                        >
                          <XIcon />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              <Show when={feedback()}>
                <p class="text-xs text-failure">{feedback()}</p>
              </Show>
            </div>

            {/* Footer actions */}
            <div class="flex items-center gap-2 border-t border-edge-muted px-4 py-2.5">
              <Show when={currentDraft().id}>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy()}
                  onClick={onDelete}
                  class="[&_svg]:size-4"
                >
                  <TrashIcon />
                  Delete
                </Button>
              </Show>

              <Button
                variant="base"
                size="sm"
                disabled={busy()}
                onClick={() =>
                  downloadIcs(draftToEvent(currentDraft()), {
                    organizerEmail: calendar.organizerEmail(),
                    organizerName: calendar.organizerName(),
                  })
                }
                class="[&_svg]:size-4"
              >
                <DownloadIcon />
                .ics
              </Button>

              <div class="flex-1" />

              <Show when={currentDraft().attendees.length > 0}>
                <Button
                  variant="base"
                  size="sm"
                  disabled={busy()}
                  onClick={onSaveAndInvite}
                  class="[&_svg]:size-4"
                >
                  <SendIcon />
                  Save & send invites
                </Button>
              </Show>

              <Button
                variant="cta"
                size="sm"
                disabled={busy()}
                onClick={onSave}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  );
}
