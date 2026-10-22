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
- `viewer_can` is viewer-relative, like an attendee's `is_self`: resolve it with
  `ActorInboxes::mark_event` and the copy's source link wherever a read path
  marks the viewer, and never store it. Each connected inbox gets its own copy
  (entity) of an event, written through that inbox's grant, so the viewer
  organizes or attends a copy only as its inbox: another of their inboxes on
  the same event lends it nothing, and only that inbox's row is `is_self`.
  Mutations act as `CalendarEventMutationTarget::copy_inbox`. A delegate owns
  no copy inbox and gets nothing beyond the no-attendees rule. `guest_policy` is
  stored on the entity row (the canonical copy's values) and in each source's
  projection, omitted there while it holds Google's default. Event responses always carry both; `StoredSourceProjection` strips
  them so unchanged events keep comparing equal.
- Preserve the conservative OOO refresh hint on write outcomes and sync reports;
  its contract is in [team sharing](../../docs/design/calendar-team-sharing.md).

## Related

- Rules: `.agents/rules/rust/architecture.md`, `.agents/rules/rust/db.md`
