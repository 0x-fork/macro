use macro_user_id::user_id::MacroUserIdStr;
use serde_json::json;

use super::*;

fn user(id: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from(id.to_string()).expect("valid user id")
}

#[test]
fn actions_split_into_tag_and_payload_columns() {
    let (action, payload) = Action::Opened.to_columns();
    assert_eq!(action, "opened");
    assert_eq!(payload, None);

    let (action, payload) = Action::Created.to_columns();
    assert_eq!(action, "created");
    assert_eq!(payload, None);
}

#[test]
fn action_wire_shape_is_adjacent_tagged() {
    assert_eq!(
        serde_json::to_value(Action::Edited).unwrap(),
        json!({ "action": "edited" })
    );
    let decoded: Action = serde_json::from_value(json!({ "action": "deleted" })).unwrap();
    assert_eq!(decoded, Action::Deleted);
}

#[test]
fn only_opened_is_a_view() {
    assert!(Action::Opened.is_view());
    assert!(!Action::Created.is_view());
    assert!(!Action::Edited.is_view());
    assert!(!Action::Deleted.is_view());
}

#[test]
fn fact_ids_are_deterministic_per_event_and_ordinal() {
    let event_id = Uuid::from_u128(7);

    assert_eq!(fact_id(event_id, 0), fact_id(event_id, 0));
    assert_ne!(fact_id(event_id, 0), fact_id(event_id, 1));
    assert_ne!(fact_id(event_id, 0), fact_id(Uuid::from_u128(8), 0));
}

#[test]
fn subject_is_the_actor_unless_delegated() {
    let direct = ActivityFact::new(
        Uuid::from_u128(1),
        0,
        Actor::new_from_user(user("macro|teo@example.com")),
        None,
        Action::Edited,
        EntityType::Document,
        "doc-1",
        Utc::now(),
    );
    assert_eq!(direct.subject_id, "macro|teo@example.com");
    assert_eq!(direct.actor.as_ref(), "macro|teo@example.com");

    let delegated = ActivityFact::new(
        Uuid::from_u128(2),
        0,
        Actor::new_from_user(user("macro|other@example.com")),
        Some(user("macro|teo@example.com")),
        Action::Edited,
        EntityType::Document,
        "doc-1",
        Utc::now(),
    );
    assert_eq!(delegated.subject_id, "macro|teo@example.com");
    assert_eq!(delegated.actor.as_ref(), "macro|other@example.com");
}
