use super::*;
use crate::domain::ics::{CalendarEventExport, CalendarEventExportAccess};

fn export(access: CalendarEventExportAccess) -> CalendarEventExport {
    CalendarEventExport {
        access,
        event_type: EventType::Default,
        ical_uid: "meeting@example.com".to_string(),
        sequence: 3,
        title: "Shared meeting".to_string(),
        description: Some("Agenda".to_string()),
        location: None,
        time: timed_time(),
        recurrence_lines: vec!["RRULE:FREQ=WEEKLY".to_string()],
        organizer_email: Some("organizer@example.com".to_string()),
        organizer_name: None,
        updated_at: Utc::now(),
    }
}

fn shared_repo() -> FakeRepo {
    FakeRepo {
        export: Some(export(CalendarEventExportAccess::ChannelShared)),
        creation_target: Some(creation_target(false)),
        ..FakeRepo::default()
    }
}

#[tokio::test]
async fn copy_imports_a_channel_shared_event_onto_the_requesters_calendar() {
    let applied_id = Uuid::now_v7();
    let repo = FakeRepo {
        persisted_event_id: Some(applied_id),
        ..shared_repo()
    };
    let upserts = repo.upserts.clone();
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let imported = provider.imported.clone();

    let copied = service(repo, provider, FakeTokens::ok())
        .copy_shared_event("macro|user", Uuid::now_v7(), None)
        .await
        .unwrap();

    assert_eq!(copied.id, applied_id);
    assert_eq!(upserts.lock().unwrap().len(), 1);
    let imported = imported.lock().unwrap();
    assert_eq!(imported.len(), 1);
    assert_eq!(imported[0].0, "primary");
    assert_eq!(imported[0].1.ical_uid, "meeting@example.com");
}

#[tokio::test]
async fn copy_leaves_the_meetings_macro_call_out() {
    let call = "https://macro.com/app/meet/join/0123456789abcdef0123456789abcdef";
    let (description, location) = crate::domain::meeting_links::attach_macro_call(
        Some("<p>Bring the budget draft</p>"),
        None,
        call,
    );
    let repo = FakeRepo {
        export: Some(CalendarEventExport {
            description: Some(description),
            location: Some(location),
            ..export(CalendarEventExportAccess::ChannelShared)
        }),
        ..shared_repo()
    };
    let provider = FakeProvider::new(FakeProviderBehavior::Echo);
    let imported = provider.imported.clone();

    service(repo, provider, FakeTokens::ok())
        .copy_shared_event("macro|user", Uuid::now_v7(), None)
        .await
        .unwrap();

    let imported = imported.lock().unwrap();
    let source = &imported[0].1;
    assert_eq!(
        source.description.as_deref(),
        Some("Bring the budget draft")
    );
    assert_eq!(source.location, None);
}

#[tokio::test]
async fn copy_refuses_before_the_provider_when_the_event_cannot_be_copied() {
    let out_of_office = CalendarEventExport {
        event_type: EventType::OutOfOffice,
        ..export(CalendarEventExportAccess::ChannelShared)
    };
    let outlook = CalendarCreationTarget {
        token_identity: CalendarLinkTokenIdentity {
            provider: crate::domain::models::CalendarProvider::Outlook,
            ..token_identity()
        },
        ..creation_target(false)
    };
    let cases = [
        // Not visible to the requester, or not there at all.
        (
            FakeRepo {
                export: None,
                ..shared_repo()
            },
            "not_found",
        ),
        // Any projection of the meeting already on their calendars.
        (
            FakeRepo {
                export: Some(export(CalendarEventExportAccess::OwnCopy)),
                ..shared_repo()
            },
            "already_on_calendar",
        ),
        (
            FakeRepo {
                export: Some(out_of_office),
                ..shared_repo()
            },
            "invalid_input",
        ),
        (
            FakeRepo {
                creation_target: None,
                ..shared_repo()
            },
            "no_writable_calendar",
        ),
        (
            FakeRepo {
                creation_target: Some(creation_target(true)),
                ..shared_repo()
            },
            "read_only",
        ),
        (
            FakeRepo {
                creation_target: Some(outlook),
                ..shared_repo()
            },
            "invalid_input",
        ),
    ];
    for (repo, expected) in cases {
        let upserts = repo.upserts.clone();
        let provider = FakeProvider::new(FakeProviderBehavior::Echo);
        let calls = provider.calls.clone();

        let result = service(repo, provider, FakeTokens::ok())
            .copy_shared_event("macro|user", Uuid::now_v7(), None)
            .await;

        assert_eq!(super::super::copy::copy_outcome(&result), expected);
        assert!(calls.lock().unwrap().is_empty(), "{expected}");
        assert!(upserts.lock().unwrap().is_empty(), "{expected}");
    }
}

#[tokio::test]
async fn copy_leaves_an_event_the_calendar_already_holds_and_syncs_it_in() {
    let target = creation_target(false);
    let email_link_id = target.email_link_id;
    let repo = FakeRepo {
        creation_target: Some(target),
        ..shared_repo()
    };
    let upserts = repo.upserts.clone();
    let scheduled_syncs = repo.scheduled_syncs.clone();

    let error = service(
        repo,
        FakeProvider::new(FakeProviderBehavior::Gone),
        FakeTokens::ok(),
    )
    .copy_shared_event("macro|user", Uuid::now_v7(), None)
    .await
    .unwrap_err();

    assert!(matches!(error, CalendarMutationError::AlreadyOnCalendar));
    assert!(upserts.lock().unwrap().is_empty());
    assert_eq!(*scheduled_syncs.lock().unwrap(), vec![email_link_id]);
}
