# calendar_events

## What it is

Part of Calendar: owns the stable `CalendarEvent` entity — parsing from
external sources (Google Calendar, Outlook, email invitations), mutation,
reminder dispatch, team availability, and provider/Postgres persistence.

## Start here

- `src/domain/models.rs` + `src/domain/events.rs`: the `CalendarEvent` entity and
  recurrence-occurrence projections.
- `src/domain/mutations.rs`, `src/domain/invitations.rs`, `src/domain/meeting_links.rs`:
  write paths — mutations, email invitations, and Macro-call meeting links.
- `src/domain/capabilities.rs`: Google's organizer-set `GuestPolicy` and the
  `ViewerCapabilities` every read surface exposes as `viewerCan`.
- `src/domain/team_availability.rs` + `src/domain/team.rs`: team sharing/availability.
- `src/outbound/google.rs`, `src/outbound/pg.rs`: Google Calendar and Postgres adapters.
- `src/outbound/pg/outlook.rs`: durable Outlook synchronization; preserve
  provider-specific coverage on discovery.
- `src/inbound/dispatch_worker.rs` + `src/outbound/sqs_dispatch_queue.rs`: reminder
  dispatch queue (feature `dispatch`/`dispatch-sqs`).

## Scope

- Owns: the `CalendarEvent` entity, its Google/Outlook/email sources, recurrence
  occurrences, reminder dispatch, and team calendar sharing/availability.
- Not here: booking links, scheduling pages, and host/attendee booking policy →
  `crates/calendar_scheduling`; the calendar service's HTTP composition root →
  `services/calendar_service`.

## Boundaries

- Depends on: `call` (feature `call-meetings`, meeting links), `macro_user_id`,
  `notification` (feature `notify`), `model_notifications`, `aws-sdk-sqs`
  (feature `dispatch-sqs`).
- Used by: `email`, `ai_tools`, `channel_bots`, `graphql_calendar`, `complete_graph`,
  `calendar_scheduling`.

## Recipes

- Add a mutation: `src/domain/mutations.rs` → `src/outbound/pg.rs` (or
  `src/outbound/calendar_service_mutations.rs` for the HTTP client adapter) →
  `src/inbound/mutation_router.rs` / `src/inbound/toolset.rs`.
- Add a reminder type: `src/domain/reminder_dispatch.rs` → `src/inbound/dispatch_worker.rs`
  → `src/outbound/notification_notifier.rs`.
- Change team availability: `src/domain/team_availability.rs` → `src/outbound/pg_team.rs`
  → `src/inbound/team_router.rs` / `src/inbound/team_toolset.rs`.

## Checks

- `cargo test -p calendar_events` (`SQLX_OFFLINE` unset).

## Gotchas

- `CalendarEvent` is the stable Macro entity; external calendars and email
  invitations are sources feeding it, and recurrence instances are queryable
  occurrence projections, not separate events — don't model them as new entities.
- Imported point (non-recurring) events must survive sync and cache round-trips
  unchanged (#7762) — a regression here silently drops user events.
- Only an organizer (or a guest the organizer lets modify) may replace an
  event's attendee list. Everyone else adds guests through `invite_guests`
  (`src/domain/mutations/invite.rs`); a guest's `update_event` attendees are
  routed there and removals are refused. Google refuses new attendees in
  `attendeesOmitted` mode (`omittedAttendeesSpecified`), so the invite writes
  the whole list Google returned plus the new guests, and a guest is refused
  (`guest_list_hidden`) while the organizer hides the guest list, since their
  copy lacks the guests it would drop. Microsoft Graph has no attendee-side
  write either: an Outlook organizer adds guests with the same full-list write
  (`email_api_client`'s `outlook/calendar/invite.rs`), and an Outlook guest may
  only answer (`guests_cannot_invite`).
- A guest without `edit_details` may change only what Google keeps on each
  guest's copy (reminders, availability) and add guests where allowed:
  `update_event` drops details the patch repeats at their stored value
  (`get_event_details`, the series or the addressed occurrence) and refuses
  any other detail change with `GuestsCannotModify` before inviting anyone.
  Someone neither organizing nor invited is left to their calendar access.
- Only the organizer of a Google copy sets the guest policy
  (`src/domain/mutations/guest_policy.rs`): drafts and patches carry it as
  Google's three switches, a policy equal to the stored one (or Google's
  defaults on create) is dropped, a change from anyone else is `NotOrganizer`,
  one on Outlook, which has no such switches, is `ProviderRejected`, and one
  scoped to a single occurrence or on a new out-of-office event is
  `InvalidInput`.
  `ViewerCapabilities::set_guest_policy` is therefore Google-only, and
  `organize` is the organizer signal clients read instead.
- A channel-shared event reaches a member's calendar as a snapshot, not a
  seat: `copy_shared_event` (`src/domain/mutations/copy.rs`) imports it under
  the meeting's iCalendar UID with no join link, behind the same
  `event_export` visibility query as the .ics route. Google imports only for
  the organizer or an attendee (`participantIsNeitherOrganizerNorAttendee`,
  mapped to `copy_refused`), so the body keeps the real organizer and lists
  the target calendar, accepted, as the only guest, plus the private
  `macroSnapshot` extended property. Sync stores it as `is_snapshot`, which
  grants no capability and makes RSVPs and invites fail with `snapshot`,
  since neither would reach the meeting. Its owner changes its details only
  as a guest without modify rights would (reminders and availability), and
  may delete it. The mutation target reads the flag from the addressed
  copy's projection, since a snapshot can share its entity with the real
  meeting on another calendar of the same inbox. Google
  only: never import over a UID the calendar already holds, since an import
  updates that event in place and would strip an unsynced invitation's
  guests.
- `viewer_can` is viewer-relative, like an attendee's `is_self`: resolve it with
  `ActorInboxes::mark_event` and the copy's source link wherever a read path
  marks the viewer, and never store it. Each connected inbox gets its own copy
  (entity) of an event, written through that inbox's grant, so the viewer
  organizes or attends a copy only as its inbox: another of their inboxes on the
  same event lends it nothing, and only that inbox's row is `is_self`. Mutations
  act as `CalendarEventMutationTarget::copy_inbox`, and so does an RSVP without
  a `responding_email`. A delegate owns no copy inbox and gets nothing beyond
  the no-attendees rule. `guest_policy` is stored on the entity row (the
  canonical copy's values) and in each source's projection, omitted there while
  it holds Google's default. Event responses always carry both;
  `StoredSourceProjection` strips them so unchanged events keep comparing equal.
- Preserve the conservative OOO refresh hint on write outcomes and sync reports;
  its contract is in [team sharing](../../docs/design/calendar-team-sharing.md).

## Related

- Rules: `.agents/rules/rust/architecture.md`, `.agents/rules/rust/db.md`
