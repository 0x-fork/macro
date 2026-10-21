use chrono::{TimeZone, Utc};
use uuid::Uuid;

use super::*;
use crate::domain::models::{
    AttendeeResponseStatus, CalendarAttendee, EventReminders, EventTime, EventTransparency,
    EventType, EventVisibility,
};

const ORGANIZER: &str = "olivia@example.com";
const GUEST: &str = "jacob@example.com";

fn attendee(email: &str, is_organizer: bool) -> CalendarAttendee {
    CalendarAttendee {
        email: email.to_string(),
        display_name: None,
        response_status: AttendeeResponseStatus::NeedsAction,
        is_organizer,
        is_optional: false,
        is_self: false,
        comment: None,
    }
}

fn event(attendees: Vec<CalendarAttendee>, guest_policy: GuestPolicy) -> CalendarEvent {
    CalendarEvent {
        id: Uuid::from_u128(7),
        owner_id: "macro|jacob@example.com".to_string(),
        ical_uid: "uid-1".to_string(),
        calendar_id: Some(Uuid::from_u128(9)),
        sources: Vec::new(),
        title: "Planning".to_string(),
        description: None,
        location: None,
        status: EventStatus::Confirmed,
        visibility: EventVisibility::Default,
        transparency: EventTransparency::Opaque,
        event_type: EventType::Default,
        time: EventTime::Timed {
            starts_at: Utc.with_ymd_and_hms(2026, 10, 22, 17, 0, 0).unwrap(),
            ends_at: Utc.with_ymd_and_hms(2026, 10, 22, 18, 0, 0).unwrap(),
            time_zone: None,
        },
        recurrence_lines: Vec::new(),
        organizer_email: Some(ORGANIZER.to_string()),
        organizer_name: None,
        creator_email: None,
        creator_name: None,
        conference_url: None,
        conference_provider: None,
        sequence: 0,
        is_read_only: false,
        attendees,
        reminders: EventReminders::default(),
        guest_policy,
        viewer_can: ViewerCapabilities::NONE,
        created_at: Utc.with_ymd_and_hms(2026, 10, 1, 0, 0, 0).unwrap(),
        updated_at: Utc.with_ymd_and_hms(2026, 10, 1, 0, 0, 0).unwrap(),
    }
}

fn meeting(guest_policy: GuestPolicy) -> CalendarEvent {
    event(
        vec![attendee(ORGANIZER, true), attendee(GUEST, false)],
        guest_policy,
    )
}

const EVERYTHING: ViewerCapabilities = ViewerCapabilities {
    edit_details: true,
    invite_guests: true,
    remove_guests: true,
    set_guest_policy: true,
    rsvp: true,
};

const LOCKED_DOWN: GuestPolicy = GuestPolicy {
    can_modify: false,
    can_invite_others: false,
    can_see_other_guests: false,
};

#[test]
fn the_organizer_may_do_everything() {
    let capabilities = ViewerCapabilities::for_event(
        &meeting(LOCKED_DOWN),
        &ActorInboxes::sole("Olivia@Example.com"),
    );

    assert_eq!(capabilities, EVERYTHING);
}

#[test]
fn an_organizer_attendee_row_counts_without_the_organizer_email() {
    let mut event = meeting(LOCKED_DOWN);
    event.organizer_email = None;

    let capabilities = ViewerCapabilities::for_event(&event, &ActorInboxes::sole(ORGANIZER));

    assert_eq!(capabilities, EVERYTHING);
}

#[test]
fn an_organizer_without_an_attendee_row_cannot_answer() {
    let event = event(vec![attendee(GUEST, false)], LOCKED_DOWN);

    let capabilities = ViewerCapabilities::for_event(&event, &ActorInboxes::sole(ORGANIZER));

    assert_eq!(
        capabilities,
        ViewerCapabilities {
            rsvp: false,
            ..EVERYTHING
        }
    );
}

#[test]
fn a_writable_event_without_attendees_is_the_actors_own() {
    let event = event(Vec::new(), LOCKED_DOWN);

    let capabilities = ViewerCapabilities::for_event(&event, &ActorInboxes::sole(GUEST));

    assert_eq!(
        capabilities,
        ViewerCapabilities {
            rsvp: false,
            ..EVERYTHING
        }
    );
}

#[test]
fn a_guest_who_may_modify_may_do_everything_but_set_the_policy() {
    let policy = GuestPolicy {
        can_modify: true,
        can_invite_others: false,
        can_see_other_guests: true,
    };

    let capabilities = ViewerCapabilities::for_event(&meeting(policy), &ActorInboxes::sole(GUEST));

    assert_eq!(
        capabilities,
        ViewerCapabilities {
            set_guest_policy: false,
            ..EVERYTHING
        }
    );
}

#[test]
fn a_guest_who_may_invite_may_add_guests_and_answer() {
    let capabilities =
        ViewerCapabilities::for_event(&meeting(GuestPolicy::default()), &ActorInboxes::sole(GUEST));

    assert_eq!(
        capabilities,
        ViewerCapabilities {
            invite_guests: true,
            rsvp: true,
            ..ViewerCapabilities::NONE
        }
    );
}

#[test]
fn a_guest_without_permissions_may_only_answer() {
    let capabilities =
        ViewerCapabilities::for_event(&meeting(LOCKED_DOWN), &ActorInboxes::sole(GUEST));

    assert_eq!(
        capabilities,
        ViewerCapabilities {
            rsvp: true,
            ..ViewerCapabilities::NONE
        }
    );
}

#[test]
fn a_read_only_event_allows_nothing_even_to_its_organizer() {
    let mut event = meeting(GuestPolicy::default());
    event.is_read_only = true;

    assert!(ViewerCapabilities::for_event(&event, &ActorInboxes::sole(ORGANIZER)).is_none());
    assert!(ViewerCapabilities::for_event(&event, &ActorInboxes::sole(GUEST)).is_none());
}

#[test]
fn a_cancelled_event_allows_nothing() {
    let mut event = meeting(GuestPolicy::default());
    event.status = EventStatus::Cancelled;

    assert!(ViewerCapabilities::for_event(&event, &ActorInboxes::sole(ORGANIZER)).is_none());
    assert!(ViewerCapabilities::for_event(&event, &ActorInboxes::sole(GUEST)).is_none());
}

#[test]
fn someone_neither_organizing_nor_invited_may_do_nothing() {
    let capabilities = ViewerCapabilities::for_event(
        &meeting(GuestPolicy {
            can_modify: true,
            can_invite_others: true,
            can_see_other_guests: true,
        }),
        &ActorInboxes::sole("teammate@example.com"),
    );

    assert!(capabilities.is_none());
}
