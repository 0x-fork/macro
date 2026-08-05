use chrono::{TimeZone as _, Utc};
use documents::domain::events::{
    DocumentCopiedMetadata, DocumentCreatedMetadata, DocumentDeletedMetadata,
    DocumentInteractionMetadata, DocumentOpenedMetadata, DocumentPurgedMetadata,
    DocumentSyncContentUpdatedMetadata, DocumentTopicEvent, DocumentUpdatedMetadata,
    InteractionReason,
};
use macro_user_id::user_id::MacroUserIdStr;
use model::document::FileType;
use uuid::Uuid;

use super::*;
use crate::domain::models::fact_id;

const DOCUMENT_ID: &str = "11111111-1111-1111-1111-111111111111";

fn user(id: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from(id.to_string()).expect("valid user id")
}

fn envelope(event: DocumentTopicEvent) -> Event<DocumentTopicEvent> {
    Event::with_event_id(Uuid::now_v7(), event)
}

fn single_fact(ingest: Ingest) -> ActivityFact {
    match ingest {
        Ingest::Facts(mut facts) => {
            assert_eq!(facts.len(), 1);
            facts.pop().unwrap()
        }
        other => panic!("expected a single fact, got {other:?}"),
    }
}

#[test]
fn created_maps_to_a_created_fact_with_the_metadata_timestamp() {
    let created_at = Utc.with_ymd_and_hms(2026, 8, 5, 12, 0, 0).unwrap();
    let event = envelope(DocumentTopicEvent::Created(DocumentCreatedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        owner: user("macro|creator@example.com"),
        document_name: "spec".to_string(),
        file_type: Some(FileType::Md),
        project_id: None,
        sub_type: None,
        created_at: Some(created_at),
    }));

    let fact = single_fact(ingest_document_event(&event));
    assert_eq!(fact.action, Action::Created);
    assert_eq!(fact.subject_id, "macro|creator@example.com");
    assert_eq!(fact.entity_type, EntityType::Document);
    assert_eq!(fact.entity_id, DOCUMENT_ID);
    assert_eq!(fact.occurred_at, created_at);
    assert_eq!(fact.id, fact_id(event.event_id, 0));
}

#[test]
fn opened_maps_to_an_opened_fact_with_the_reported_timestamp() {
    let opened_at = Utc.with_ymd_and_hms(2026, 8, 5, 13, 0, 0).unwrap();
    let event = envelope(DocumentTopicEvent::Opened(DocumentOpenedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        actor_user_id: user("macro|viewer@example.com"),
        opened_at,
    }));

    let fact = single_fact(ingest_document_event(&event));
    assert_eq!(fact.action, Action::Opened);
    assert!(fact.action.is_view());
    assert_eq!(fact.subject_id, "macro|viewer@example.com");
    assert_eq!(fact.occurred_at, opened_at);
}

#[test]
fn attributed_update_and_delete_map_to_facts() {
    let updated = envelope(DocumentTopicEvent::Updated(DocumentUpdatedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        owner: user("macro|owner@example.com"),
        actor_user_id: Some(user("macro|editor@example.com")),
        document_name: Some("renamed".to_string()),
        previous_project_id: None,
        project_id: None,
        file_type: None,
        share_permission_updated: false,
    }));
    let fact = single_fact(ingest_document_event(&updated));
    assert_eq!(fact.action, Action::Edited);
    assert_eq!(fact.subject_id, "macro|editor@example.com");

    let deleted = envelope(DocumentTopicEvent::Deleted(DocumentDeletedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        actor_user_id: Some(user("macro|editor@example.com")),
        project_id: None,
    }));
    let fact = single_fact(ingest_document_event(&deleted));
    assert_eq!(fact.action, Action::Deleted);
}

#[test]
fn unattributable_mutations_are_dropped() {
    let updated = envelope(DocumentTopicEvent::Updated(DocumentUpdatedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        owner: user("macro|owner@example.com"),
        actor_user_id: None,
        document_name: None,
        previous_project_id: None,
        project_id: None,
        file_type: None,
        share_permission_updated: true,
    }));
    assert_eq!(ingest_document_event(&updated), Ingest::Ignore);

    let deleted = envelope(DocumentTopicEvent::Deleted(DocumentDeletedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        actor_user_id: None,
        project_id: None,
    }));
    assert_eq!(ingest_document_event(&deleted), Ingest::Ignore);
}

#[test]
fn copied_maps_to_a_created_fact_for_the_new_document() {
    let event = envelope(DocumentTopicEvent::Copied(DocumentCopiedMetadata {
        document_id: "22222222-2222-2222-2222-222222222222".to_string(),
        source_document_id: DOCUMENT_ID.to_string(),
        source_version_id: None,
        owner: user("macro|copier@example.com"),
        document_name: "copy".to_string(),
        file_type: None,
        project_id: None,
        sub_type: None,
    }));

    let fact = single_fact(ingest_document_event(&event));
    assert_eq!(fact.action, Action::Created);
    assert_eq!(fact.entity_id, "22222222-2222-2222-2222-222222222222");
}

#[test]
fn purge_requests_entity_deletion() {
    let event = envelope(DocumentTopicEvent::Purged(DocumentPurgedMetadata {
        document_id: DOCUMENT_ID.to_string(),
    }));

    assert_eq!(
        ingest_document_event(&event),
        Ingest::PurgeEntity {
            entity_type: EntityType::Document,
            entity_id: DOCUMENT_ID.to_string(),
        }
    );
}

#[test]
fn pipeline_and_session_events_are_ignored() {
    let sync = envelope(DocumentTopicEvent::SyncContentUpdated(
        DocumentSyncContentUpdatedMetadata {
            document_id: DOCUMENT_ID.to_string(),
            file_type: FileType::Md,
            document_version_id: None,
        },
    ));
    assert_eq!(ingest_document_event(&sync), Ingest::Ignore);

    let interaction = envelope(DocumentTopicEvent::Interaction(
        DocumentInteractionMetadata {
            document_id: DOCUMENT_ID.to_string(),
            reason: InteractionReason::FirstJoin,
        },
    ));
    assert_eq!(ingest_document_event(&interaction), Ingest::Ignore);
}

#[test]
fn replaying_an_event_derives_identical_fact_ids() {
    let event = envelope(DocumentTopicEvent::Opened(DocumentOpenedMetadata {
        document_id: DOCUMENT_ID.to_string(),
        actor_user_id: user("macro|viewer@example.com"),
        opened_at: Utc::now(),
    }));

    let first = single_fact(ingest_document_event(&event));
    let second = single_fact(ingest_document_event(&event));
    assert_eq!(first.id, second.id);
}
