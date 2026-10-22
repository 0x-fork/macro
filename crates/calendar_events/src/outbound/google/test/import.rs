use super::*;
use crate::domain::ics::{CalendarEventExport, CalendarEventExportAccess};

fn export(time: EventTime, recurrence_lines: Vec<String>) -> CalendarEventExport {
    CalendarEventExport {
        access: CalendarEventExportAccess::ChannelShared,
        event_type: EventType::Default,
        ical_uid: "meeting@example.com".to_string(),
        sequence: 4,
        title: "Offsite".to_string(),
        description: Some("<p>Agenda</p>".to_string()),
        location: Some("HQ".to_string()),
        time,
        recurrence_lines,
        organizer_email: Some("organizer@example.com".to_string()),
        organizer_name: Some("Organizer".to_string()),
        updated_at: Utc::now(),
    }
}

#[test]
fn import_body_copies_the_meeting_without_guests_or_conference() {
    let source = export(
        EventTime::AllDay {
            start_date: NaiveDate::from_ymd_opt(2026, 9, 24).unwrap(),
            end_date: NaiveDate::from_ymd_opt(2026, 9, 25).unwrap(),
        },
        vec!["RRULE:FREQ=WEEKLY".to_string()],
    );

    let body = super::super::import::import_body(&source);

    assert_eq!(body["iCalUID"], "meeting@example.com");
    assert_eq!(body["summary"], "Offsite");
    assert_eq!(body["description"], "<p>Agenda</p>");
    assert_eq!(body["location"], "HQ");
    assert_eq!(body["sequence"], 4);
    assert_eq!(body["start"]["date"], "2026-09-24");
    assert_eq!(body["end"]["date"], "2026-09-25");
    assert_eq!(body["recurrence"], serde_json::json!(["RRULE:FREQ=WEEKLY"]));
    assert_eq!(
        body["organizer"],
        serde_json::json!({ "email": "organizer@example.com", "displayName": "Organizer" })
    );
    assert!(body.get("attendees").is_none());
    assert!(body.get("conferenceData").is_none());
}

#[cfg(feature = "inbound")]
#[tokio::test]
async fn import_writes_only_when_the_calendar_does_not_hold_the_meeting() {
    use axum::{
        Json, Router,
        extract::{Query, State},
        routing::{get, post},
    };
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct Remote {
        held: Arc<Mutex<Vec<serde_json::Value>>>,
        imports: Arc<Mutex<Vec<serde_json::Value>>>,
        listed_uids: Arc<Mutex<Vec<String>>>,
    }
    async fn list(
        State(remote): State<Remote>,
        Query(query): Query<std::collections::HashMap<String, String>>,
    ) -> Json<serde_json::Value> {
        // Hidden invitations count: an import would overwrite them too.
        assert_eq!(
            query.get("showHiddenInvitations").map(String::as_str),
            Some("true")
        );
        remote
            .listed_uids
            .lock()
            .unwrap()
            .push(query.get("iCalUID").cloned().unwrap_or_default());
        let held = remote.held.lock().unwrap().clone();
        Json(serde_json::json!({ "items": held }))
    }
    async fn import(
        State(remote): State<Remote>,
        Json(body): Json<serde_json::Value>,
    ) -> Json<serde_json::Value> {
        remote.imports.lock().unwrap().push(body.clone());
        let mut event = body;
        event["id"] = serde_json::json!("imported-id");
        event["created"] = serde_json::json!("2026-07-20T14:00:00Z");
        event["updated"] = serde_json::json!("2026-07-20T14:00:00Z");
        Json(event)
    }
    let remote = Remote::default();
    let app = Router::new()
        .route("/calendars/primary/events", get(list))
        .route("/calendars/primary/events/import", post(import))
        .with_state(remote.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = GoogleCalendarClient {
        client: Client::new(),
        gate: UnmeteredGate,
        api_base: endpoint,
    };
    let target = ProviderCalendarTarget {
        binding: None,
        provider: crate::domain::models::CalendarProvider::Google,
        observed_access_role: Some("owner".to_owned()),
        owner_id: "macro|member@example.test".into(),
        email_link_id: Uuid::now_v7(),
        account_id: Uuid::now_v7(),
        calendar_id: Uuid::now_v7(),
        provider_calendar_id: "primary".into(),
        is_read_only: false,
        range: OccurrenceRange::maintenance_horizon(Utc::now()),
    };
    let starts_at = Utc::now() + chrono::Duration::days(1);
    let source = export(
        EventTime::Timed {
            starts_at,
            ends_at: starts_at + chrono::Duration::hours(1),
            time_zone: Some("UTC".to_string()),
        },
        Vec::new(),
    );

    let copied = client
        .import_event("test-token", &target, &source)
        .await
        .unwrap()
        .expect("an empty calendar takes the copy");
    assert_eq!(copied.event.ical_uid, "meeting@example.com");
    assert_eq!(copied.event.title, "Offsite");
    assert!(copied.event.attendees.is_empty());
    assert_eq!(remote.imports.lock().unwrap().len(), 1);

    // An invitation Google holds but Macro has not synced yet would lose its
    // guests and join link if the import updated it in place.
    remote.held.lock().unwrap().push(serde_json::json!({
        "id": "invitation-id",
        "iCalUID": "meeting@example.com",
        "summary": "Offsite",
        "start": {"dateTime": "2026-07-24T14:00:00Z"},
        "end": {"dateTime": "2026-07-24T15:00:00Z"},
        "created": "2026-07-20T14:00:00Z",
        "updated": "2026-07-20T14:00:00Z"
    }));
    let held = client
        .import_event("test-token", &target, &source)
        .await
        .unwrap();
    assert!(held.is_none());
    assert_eq!(remote.imports.lock().unwrap().len(), 1);
    assert_eq!(
        *remote.listed_uids.lock().unwrap(),
        vec!["meeting@example.com", "meeting@example.com"]
    );
    task.abort();
}
