//! Core traits and types for the stream service.
use super::types::*;
use async_trait::async_trait;
use futures::stream::{Stream, StreamExt};
use std::pin::Pin;
use std::sync::Arc;

/// A boxed stream that yields items with their offsets.
pub type ItemStream<T> = Pin<Box<dyn Stream<Item = T> + Send>>;
pub type ItemId = String;

#[derive(Clone, Debug)]
pub struct StreamId {
    pub entity_id: String,
    pub stream_id: String,
}

/// A stream service provides durable stream storage with support for
/// reconnection, replay, and replay from offset.
#[async_trait]
pub trait StreamService<T>: Send + Sync + 'static
where
    T: Send + Sync + 'static,
{
    fn from_async_stream(
        self: Arc<Self>,
        id: StreamId,
        mut stream: ItemStream<T>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            while let Some(item) = stream.next().await {
                if let Err(e) = self.append(&id, item).await {
                    tracing::error!(error=?e,"failed to append to stream");
                    return;
                }
            }
        })
    }
    async fn append(&self, id: &StreamId, item: T) -> Result<ItemId>;
    async fn stream_from_beginning(&self, id: &StreamId) -> Result<ItemStream<T>>;
}
