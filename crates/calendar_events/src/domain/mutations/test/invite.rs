use super::*;

const ORGANIZER: &str = "olivia@example.com";

fn guest(email: &str) -> CalendarAttendeeInput {
    CalendarAttendeeInput {
        email: email.to_string(),
        is_optional: false,
        response_status: None,
    }
}

/// A target where the actor (`self@example.com`) is a guest of Olivia's
/// meeting under `guest_policy`.
fn guest_target(guest_policy: GuestPolicy) -> CalendarEventMutationTarget {
    CalendarEventMutationTarget {
        organizer_email: Some(ORGANIZER.to_string()),
        guest_policy,
        ..mutation_target(false)
    }
}

fn meeting_attendees() -> Vec<CalendarAttendee> {
    let mut organizer = echo_attendee(ORGANIZER, false);
    organizer.is_organizer = true;
    vec![organizer, echo_attendee("self@example.com", false)]
}

fn guest_repo(guest_policy: GuestPolicy) -> FakeRepo {
    FakeRepo {
        mutation_target: Some(guest_target(guest_policy)),
        stored_attendees: meeting_attendees(),
        ..FakeRepo::default()
    }
}

const NO_INVITES: GuestPolicy = GuestPolicy {
    can_modify: false,
    can_invite_others: false,
    can_see_other_guests: true,
};

#[tokio::test]
async fn a_guest_who_may_invite_sends_only_new_guests_through_the_partial_patch() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();
    let invited = provider.invited_guests.clone();

    service(
        guest_repo(GuestPolicy::default()),
        provider,
        FakeTokens::ok(),
    )
    .invite_guests(
        "macro|user",
        Uuid::now_v7(),
        None,
        vec![
            guest("ada@example.com"),
            guest("OLIVIA@example.com"),
            guest("ada@example.com"),
        ],
        CalendarUpdateScope::ThisEvent {
            recurrence_id: "2026-08-06T14:00:00+00:00".to_string(),
        },
    )
    .await
    .unwrap();

    assert_eq!(
        calls.lock().unwrap().as_slice(),
        ["invite:master-id:this:2026-08-06T14:00:00+00:00"]
    );
    assert_eq!(
        invited.lock().unwrap().as_slice(),
        [vec![guest("ada@example.com")]],
        "guests already on the event, and repeats, are not sent again"
    );
}

#[tokio::test]
async fn a_guest_the_organizer_does_not_let_invite_is_refused_before_the_provider() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();

    let error = service(guest_repo(NO_INVITES), provider, FakeTokens::ok())
        .invite_guests(
            "macro|user",
            Uuid::now_v7(),
            None,
            vec![guest("ada@example.com")],
            CalendarUpdateScope::All,
        )
        .await
        .unwrap_err();

    assert!(matches!(error, CalendarMutationError::GuestsCannotInvite));
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn someone_neither_organizing_nor_invited_is_not_an_attendee() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();
    let mut repo = guest_repo(GuestPolicy::default());
    repo.stored_attendees = vec![meeting_attendees().remove(0)];

    let error = service(repo, provider, FakeTokens::ok())
        .invite_guests(
            "macro|user",
            Uuid::now_v7(),
            None,
            vec![guest("ada@example.com")],
            CalendarUpdateScope::All,
        )
        .await
        .unwrap_err();

    assert!(matches!(error, CalendarMutationError::NotAttendee));
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_refusal_from_google_records_that_guests_cannot_invite() {
    let repo = guest_repo(GuestPolicy::default());
    let disabled = repo.disabled_guest_invites.clone();
    let refresh = RecordingRefreshNotifier::default();
    let notified = refresh.notified.clone();
    let event_id = Uuid::now_v7();

    let error = service_with_refresh(
        repo,
        FakeProvider::new(FakeProviderBehavior::Forbidden),
        FakeTokens::ok(),
        refresh,
    )
    .invite_guests(
        "macro|user",
        event_id,
        None,
        vec![guest("ada@example.com")],
        CalendarUpdateScope::All,
    )
    .await
    .unwrap_err();

    assert!(matches!(error, CalendarMutationError::GuestsCannotInvite));
    assert_eq!(disabled.lock().unwrap().as_slice(), [event_id]);
    assert_eq!(
        notified.lock().unwrap().len(),
        1,
        "viewers refetch so the invite control turns into the explanation"
    );
}

#[tokio::test]
async fn a_guests_update_adds_through_the_invite_path_and_keeps_its_other_fields() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();
    let invited = provider.invited_guests.clone();
    let patches = provider.updated_patches.clone();

    service(
        guest_repo(GuestPolicy::default()),
        provider,
        FakeTokens::ok(),
    )
    .update_event(
        "macro|user",
        Uuid::now_v7(),
        None,
        CalendarEventPatch {
            title: Some("Planning".to_string()),
            // The editor leaves the viewer's own row out of the list.
            attendees: Some(vec![guest(ORGANIZER), guest("ada@example.com")]),
            ..CalendarEventPatch::default()
        },
        CalendarUpdateScope::All,
    )
    .await
    .unwrap();

    assert_eq!(
        calls.lock().unwrap().as_slice(),
        ["invite:master-id:all", "update:master-id"]
    );
    assert_eq!(
        invited.lock().unwrap().as_slice(),
        [vec![guest("ada@example.com")]]
    );
    let sent = patches.lock().unwrap();
    assert_eq!(
        sent[0].attendees, None,
        "the replacement list never reaches Google"
    );
    assert_eq!(sent[0].title.as_deref(), Some("Planning"));
}

#[tokio::test]
async fn a_guest_cannot_remove_guests_through_an_update() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();

    let error = service(
        guest_repo(GuestPolicy::default()),
        provider,
        FakeTokens::ok(),
    )
    .update_event(
        "macro|user",
        Uuid::now_v7(),
        None,
        CalendarEventPatch {
            attendees: Some(vec![guest("ada@example.com")]),
            ..CalendarEventPatch::default()
        },
        CalendarUpdateScope::All,
    )
    .await
    .unwrap_err();

    assert!(
        matches!(&error, CalendarMutationError::InvalidInput(message) if message == "guests can add guests but not remove them"),
        "{error:?}"
    );
    assert!(calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_guest_who_may_modify_still_replaces_the_list() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let calls = provider.calls.clone();

    service(
        guest_repo(GuestPolicy {
            can_modify: true,
            can_invite_others: true,
            can_see_other_guests: true,
        }),
        provider,
        FakeTokens::ok(),
    )
    .update_event(
        "macro|user",
        Uuid::now_v7(),
        None,
        CalendarEventPatch {
            attendees: Some(vec![guest("ada@example.com")]),
            ..CalendarEventPatch::default()
        },
        CalendarUpdateScope::All,
    )
    .await
    .unwrap();

    assert_eq!(calls.lock().unwrap().as_slice(), ["update:master-id"]);
}

#[tokio::test]
async fn an_occurrence_with_its_own_guest_list_is_judged_by_that_list() {
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let invited = provider.invited_guests.clone();
    let mut repo = guest_repo(GuestPolicy::default());
    // The series still lists Bo, but this occurrence dropped him.
    repo.stored_attendees
        .push(echo_attendee("bo@example.com", false));
    repo.occurrence_override_attendees = Some(meeting_attendees());

    service(repo, provider, FakeTokens::ok())
        .update_event(
            "macro|user",
            Uuid::now_v7(),
            None,
            CalendarEventPatch {
                attendees: Some(vec![guest(ORGANIZER), guest("bo@example.com")]),
                ..CalendarEventPatch::default()
            },
            CalendarUpdateScope::ThisEvent {
                recurrence_id: "2026-08-06T14:00:00+00:00".to_string(),
            },
        )
        .await
        .unwrap();

    assert_eq!(
        invited.lock().unwrap().as_slice(),
        [vec![guest("bo@example.com")]],
        "re-inviting Bo to this occurrence is an addition, not a no-op"
    );
}
