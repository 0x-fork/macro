//! Durable stream service for reconnectable, replayable streams.
//!
//! This crate provides a stream service that supports:
//! - Creating durable streams
//! - Appending items to streams
//! - Reading streams from any offset
//! - Reconnection and replay
//!
//! # Example
//!
//! ```
//! use stream::{InMemoryStreamStore, StreamService, StreamItem, WithOffset};
//! use futures::StreamExt;
//! use std::pin::Pin;
//!
//! # tokio_test::block_on(async {
//! let store = InMemoryStreamStore::new();
//!
//! // Create a new stream
//! let stream_id = store.create().await.unwrap();
//!
//! // Append items to the stream
//! store.append(&stream_id, StreamItem::Item("hello".to_string())).await.unwrap();
//! store.append(&stream_id, StreamItem::Item("world".to_string())).await.unwrap();
//! store.append::<String>(&stream_id, StreamItem::End).await.unwrap();
//!
//! // Read all items from the beginning (returns a Stream)
//! let stream = store.read::<String>(&stream_id, None).await.unwrap();
//! let items: Vec<WithOffset<StreamItem<String>>> = Pin::from(stream)
//!     .collect::<Vec<_>>()
//!     .await
//!     .into_iter()
//!     .collect::<Result<_, _>>()
//!     .unwrap();
//! assert_eq!(items.len(), 3);
//!
//! // Read items after a specific offset (for reconnection)
//! let stream = store.read::<String>(&stream_id, Some(1)).await.unwrap();
//! let items: Vec<WithOffset<StreamItem<String>>> = Pin::from(stream)
//!     .collect::<Vec<_>>()
//!     .await
//!     .into_iter()
//!     .collect::<Result<_, _>>()
//!     .unwrap();
//! assert_eq!(items.len(), 2); // "world" and End
//! # });
//! ```

pub mod domain;
pub mod inbound;
pub mod outbound;

pub use domain::traits::{Offset, StreamId, StreamItem, StreamService, WithOffset};
pub use outbound::in_memory::{InMemoryError, InMemoryStreamStore};
