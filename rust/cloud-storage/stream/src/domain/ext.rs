//! Extension traits for StreamRepo.

use super::traits::*;
use futures::StreamExt;
use std::sync::Arc;
use std::time::Duration;

pub trait StreamManagerExt<T>: StreamRepo<T>
where
    T: Send + Sync + 'static,
{
    /// Create a durable stream from an async stream.
    /// Consumes the async stream and closes the durable stream when it ends.
    fn from_async_stream(
        self: Arc<Self>,
        id: StreamId,
        stream: ItemStream<T>,
        timeout: Option<Duration>,
    ) -> tokio::task::JoinHandle<()>;
}

impl<S, T> StreamManagerExt<T> for S
where
    S: StreamRepo<T> + ?Sized,
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
}
