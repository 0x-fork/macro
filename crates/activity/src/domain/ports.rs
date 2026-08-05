//! Storage port for activity facts.

use model_entity::EntityType;

use super::models::ActivityFact;

/// Persists activity facts.
pub trait ActivityRepo {
    /// The adapter's error type.
    type Err: std::error::Error + Send + Sync + 'static;

    /// Inserts facts idempotently: a fact whose id already exists is left
    /// untouched, so at-least-once redelivery is safe.
    fn insert_facts(
        &self,
        facts: &[ActivityFact],
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Hard-deletes every fact for a purged entity.
    fn purge_entity(
        &self,
        entity_type: EntityType,
        entity_id: &str,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;
}
