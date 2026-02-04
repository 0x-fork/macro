//! Core traits and types for the stream service.
use super::types::*;
use super::{StreamId, StreamItem};
use async_trait::async_trait;
use futures::stream::Stream;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::Receiver;
use tokio::sync::mpsc::Sender;

/// Default stream should not last longer than 5 minutes
pub const DEFAULT_STREAM_TIMEOUT: Duration = Duration::from_secs(300);

/// A boxed stream that yields items with their offsets.
pub type ItemStream = Pin<Box<dyn Stream<Item = StreamItem> + Send>>;
/// A boxed stream of payloads to append.
pub type PayloadStream = Pin<Box<dyn Stream<Item = String> + Send>>;
pub type ItemId = String;

#[derive(Debug, Clone)]
pub enum Offset {
    Beginning,
    Location(String),
}

/// A stream service provides durable stream storage
/// This is the base trait of this crate and should be
/// used by consumers through the StreamManager
#[async_trait]
pub trait StreamRepo: Send + Sync + 'static {
    /// Append an item to an existing stream or create a new stream and append an item to it
    async fn append(&self, id: &StreamId, payload: String) -> Result<ItemId>;
    /// Get an async stream that will stream from the beginning of a stream and continue to
    /// listen for new items
    async fn stream_from_beginning(&self, id: &StreamId) -> Result<ItemStream>;
    /// Mark a stream as closed
    async fn close(&self, id: &StreamId) -> Result<()>;
    /// List active streams for an entity (implementations may treat all streams as active).
    async fn active_streams(&self, entity_id: &str) -> Result<Vec<StreamId>>;
    /// A receiver that receives StreamId's when new streams are created
    async fn notify(&self) -> Receiver<StreamId>;
}

#[async_trait]
pub trait StreamManager<T>: Send + Sync + 'static
where
    T: Send + Sync + 'static,
    T: From<StreamItem>,
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
