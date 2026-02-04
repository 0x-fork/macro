//! Core traits and types for the stream service.
use super::types::*;
use async_trait::async_trait;
use futures::stream::{Stream, StreamExt};
use model_entity::EntityType;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::Receiver;
use tokio::sync::mpsc::Sender;

/// Default stream should not last longer than 5 minutes
pub const DEFAULT_STREAM_TIMEOUT: Duration = Duration::from_secs(300);

/// A boxed stream that yields items with their offsets.
pub type ItemStream<T> = Pin<Box<dyn Stream<Item = T> + Send>>;
pub type ItemId = String;

#[derive(Debug, Clone)]
pub enum Offset {
    Beginning,
    Location(String),
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct StreamId {
    pub entity_type: EntityType,
    pub entity_id: String,
    pub stream_id: String,
}

/// A stream service provides durable stream storage
/// This is the base trait of this crate and should be
/// used by consumers through the StreamManager
#[async_trait]
pub trait StreamRepo<T>: Send + Sync + 'static
where
    T: Send + Sync + 'static,
{
    /// Append an item to an existing stream or create a new stream and append an item to it
    async fn append(&self, id: &StreamId, item: T) -> Result<ItemId>;
    /// Get an async stream that will stream from the beginning of a stream and continue to
    /// listen for new items
    async fn stream_from_beginning(&self, id: &StreamId) -> Result<ItemStream<T>>;
    /// Mark a stream as closed
    async fn close(&self, id: &StreamId) -> Result<()>;
    /// List active streams for an entity (implementations may treat all streams as active).
    async fn active_streams(&self, entity_id: &str) -> Result<Vec<StreamId>>;
    /// A receiver that receives StreamId's when new streams are created
    async fn notify(&self) -> Receiver<StreamId>;
}

#[async_trait]
pub trait StreamManager<T>
where
    T: Send + Sync + 'static,
{
    /// subscribe a sender (intended to be a websocket) to
    /// all streams on an entity
    async fn subscribe(
        self: Arc<Self>,
        entity_id: String,
        sender_id: String,
        sender: Sender<T>,
    ) -> Result<()>;
    async fn unsubscribe(self: Arc<Self>, entity_id: &str, sender_id: &str) -> Result<()>;
}
