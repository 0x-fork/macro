//! Core traits and types for the stream service.
use super::types::*;
use async_trait::async_trait;
use futures::stream::{Stream, StreamExt};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch::Receiver;

/// Default stream should not last longer than 5 minutes
pub const DEFAULT_STREAM_TIMEOUT: Duration = Duration::from_secs(300);

/// A boxed stream that yields items with their offsets.
pub type ItemStream<T> = Pin<Box<dyn Stream<Item = T> + Send>>;
pub type ItemId = String;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
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
    /// Create a durable stream from an async stream
    /// Consume async stream and close the durable stream when it ends
    fn from_async_stream(
        self: Arc<Self>,
        id: StreamId,
        mut stream: ItemStream<T>,
        timeout: Option<Duration>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn({
            async move {
                let _ =
                    tokio::time::timeout(timeout.unwrap_or(DEFAULT_STREAM_TIMEOUT), async move {
                        while let Some(item) = stream.next().await {
                            if let Err(e) = self.append(&id, item).await {
                                tracing::error!(error=?e,"failed to append to stream");
                                return;
                            }
                        }
                        let _ = self.close(&id).await.inspect_err(
                            |e| tracing::error!(error=?e, "failed to mark stream as closed stream"),
                        );
                    })
                    .await
                    .inspect_err(|e| tracing::error!(error=?e, "stream timed out"));
            }
        })
    }
    /// Append an item to an existing stream or create a new stream and append an item to it
    async fn append(&self, id: &StreamId, item: T) -> Result<ItemId>;
    /// Get an async stream that will stream from the beginning of a stream and continue to
    /// listen for new items
    async fn stream_from_beginning(&self, id: &StreamId) -> Result<ItemStream<T>>;
    /// Mark a stream as closed
    async fn close(&self, id: &StreamId) -> Result<()>;
    /// A reciever that recieves StreamId's when new streams are created
    fn notify(&self) -> Receiver<StreamId>;
}
