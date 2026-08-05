//! Maps `macro.documents` broker events to activity facts.

#[cfg(test)]
mod test;

use chrono::{DateTime, Utc};
use documents::domain::events::DocumentTopicEvent;
use macro_event_broker::Event;
use model_entity::EntityType;

use super::models::{Action, ActivityFact, Actor};

/// What ingesting one broker event asks of storage.
#[derive(Debug, Clone, PartialEq)]
pub enum Ingest {
    /// Insert these facts.
    Facts(Vec<ActivityFact>),
    /// The entity was hard-deleted; purge its facts.
    PurgeEntity {
        /// The kind of the purged entity.
        entity_type: EntityType,
        /// The purged entity.
        entity_id: String,
    },
    /// The event carries no activity: pipeline noise, or a mutation with no
    /// actor (unattributable facts are dropped until a system principal
    /// exists).
    Ignore,
}

/// `occurred_at` fallback for events whose metadata carries no timestamp:
/// the broker event id is a uuidv7, whose embedded time is when the source
/// domain published. Replays keep the first stored value regardless (fact
/// inserts are `ON CONFLICT DO NOTHING`).
fn event_time(event: &Event<DocumentTopicEvent>) -> DateTime<Utc> {
    event
        .event_id
        .get_timestamp()
        .and_then(|ts| {
            let (seconds, nanos) = ts.to_unix();
            DateTime::from_timestamp(i64::try_from(seconds).ok()?, nanos)
        })
        .unwrap_or_else(Utc::now)
}

/// Maps one `macro.documents` event to its ingest outcome.
///
/// Exhaustive on purpose: a new upstream variant fails compilation here
/// until someone classifies it or explicitly drops it.
pub fn ingest_document_event(event: &Event<DocumentTopicEvent>) -> Ingest {
    let single_fact = |actor: Actor<'static>, action: Action, entity_id: &str, occurred_at| {
        Ingest::Facts(vec![ActivityFact::new(
            event.event_id,
            0,
            actor,
            None,
            action,
            EntityType::Document,
            entity_id,
            occurred_at,
        )])
    };

    match &event.event {
        DocumentTopicEvent::Created(metadata) => single_fact(
            Actor::new_from_user(metadata.owner.clone()),
            Action::Created,
            &metadata.document_id,
            metadata.created_at.unwrap_or_else(|| event_time(event)),
        ),
        DocumentTopicEvent::Updated(metadata) => match &metadata.actor_user_id {
            Some(actor) => single_fact(
                Actor::new_from_user(actor.clone()),
                Action::Edited,
                &metadata.document_id,
                event_time(event),
            ),
            None => Ingest::Ignore,
        },
        DocumentTopicEvent::Deleted(metadata) => match &metadata.actor_user_id {
            Some(actor) => single_fact(
                Actor::new_from_user(actor.clone()),
                Action::Deleted,
                &metadata.document_id,
                event_time(event),
            ),
            None => Ingest::Ignore,
        },
        // The copy is a new document; its creation is the fact.
        DocumentTopicEvent::Copied(metadata) => single_fact(
            Actor::new_from_user(metadata.owner.clone()),
            Action::Created,
            &metadata.document_id,
            event_time(event),
        ),
        DocumentTopicEvent::Opened(metadata) => single_fact(
            Actor::new_from_user(metadata.actor_user_id.clone()),
            Action::Opened,
            &metadata.document_id,
            metadata.opened_at,
        ),
        DocumentTopicEvent::Purged(metadata) => Ingest::PurgeEntity {
            entity_type: EntityType::Document,
            entity_id: metadata.document_id.clone(),
        },
        // Extraction-pipeline noise, not user activity.
        DocumentTopicEvent::ContentUploaded(_) => Ingest::Ignore,
        // Carries no actor today; becomes an Edited fact once collab edits
        // are attributed.
        DocumentTopicEvent::SyncContentUpdated(_) => Ingest::Ignore,
        // Session lifecycle (first join / last leave), no actor.
        DocumentTopicEvent::Interaction(_) => Ingest::Ignore,
    }
}
