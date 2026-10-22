import { toast } from '@core/component/Toast/Toast';
import { fireAndForget } from '@core/util/fireAndForget';
import {
  type InviteCalendarEventGuestsArgs,
  isGuestInviteRefused,
  useInviteCalendarEventGuestsMutation,
} from '@queries/calendar/mutations';
import type { CalendarInviteScope } from '@service-email/client';
import { ResultAsync } from 'neverthrow';
import { type Accessor, createSignal } from 'solid-js';
import type { CalendarEvent } from '../types';
import {
  GUEST_INVITES_RESTRICTED,
  guestInvitesRestricted,
} from '../utils/event-guest-editing';

/** Guests an editor sends an invitation to, with the names its toast uses. */
export interface GuestInvitation {
  guests: { email: string; name: string; optional: boolean }[];
  scope: CalendarInviteScope;
}

export function invitationSentMessage(guests: readonly { name: string }[]) {
  return guests.length === 1
    ? `Invitation sent to ${guests[0]?.name}`
    : `Invitations sent to ${guests.length} people`;
}

/**
 * Inviting guests from event details. The editor closes as soon as the
 * invitation goes out, while the mutation shows the new guests as unanswered.
 * The outcome is announced once the provider answers, since that takes
 * seconds. A refusal means the organizer does not let guests invite, which
 * switches the details to their explanation.
 */
export function createGuestInviteController(
  event: Accessor<CalendarEvent>,
  enabled: Accessor<boolean>
) {
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [refused, setRefused] = createSignal(false);
  const mutation = useInviteCalendarEventGuestsMutation();

  const deliver = async (
    args: InviteCalendarEventGuestsArgs,
    sentMessage: string
  ) => {
    const result = await ResultAsync.fromPromise(
      mutation.mutateAsync(args),
      (error) => error
    );
    if (result.isOk()) {
      if (result.value === 'queued') {
        toast.alert('Invitations will be sent when you are back online');
        return;
      }
      toast.success(sentMessage);
      return;
    }
    if (isGuestInviteRefused(result.error)) {
      setRefused(true);
      toast.failure(GUEST_INVITES_RESTRICTED);
      return;
    }
    toast.failure('Could not send invitations', {
      subtext: result.error instanceof Error ? result.error.message : undefined,
    });
  };

  return {
    editorOpen,
    setEditorOpen,
    canInvite: () => {
      const current = event();
      return (
        enabled() &&
        !refused() &&
        !current.isReadOnly &&
        !current.isCancelled &&
        !current.teamProjection &&
        current.viewerCan.inviteGuests
      );
    },
    restricted: () => refused() || guestInvitesRestricted(event()),
    send: (invitation: GuestInvitation) => {
      if (invitation.guests.length === 0) return;
      if (!navigator.onLine) {
        toast.failure('You are offline. Reconnect to send invitations.');
        return;
      }
      const current = event();
      const oneOccurrence = invitation.scope === 'this_event';
      setEditorOpen(false);
      fireAndForget(
        deliver(
          {
            eventId: current.eventId,
            calendarId: current.calendarId,
            guests: invitation.guests.map(({ email, optional }) => ({
              email,
              optional,
            })),
            scope: invitation.scope,
            recurrenceId: oneOccurrence
              ? (current.recurrenceId ?? current.occurrenceKey)
              : undefined,
            occurrenceKey: oneOccurrence ? current.occurrenceKey : undefined,
          },
          invitationSentMessage(invitation.guests)
        ),
        'calendar-guest-invites'
      );
    },
  };
}

export type GuestInviteController = ReturnType<
  typeof createGuestInviteController
>;
