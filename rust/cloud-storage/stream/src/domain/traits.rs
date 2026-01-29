//! Core traits and types for the stream service.
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::future::Future;

/// A unique identifier for a stream.
pub type StreamId = String;

/// An offset within a stream, representing the position of an item.
pub type Offset = usize;

/// A boxed stream that yields items with their offsets.
pub type StreamWithOffset<T, E> = Box<dyn Stream<Item = Result<WithOffset<StreamItem<T>>, E>>>;

/// An item in a stream, which can be data, an error, or an end marker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamItem<T> {
    /// A data item in the stream.
    Item(T),
    /// An error that occurred during stream processing.
    Error(String),
    /// Marks the end of the stream.
    End,
}

/// Wraps a value with its offset in the stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WithOffset<T> {
    /// The wrapped item.
    pub item: T,
    /// The offset of this item in the stream.
    pub offset: Offset,
}

/// A stream service provides durable stream storage with support for
/// reconnection, replay, and replay from offset.
pub trait StreamService: Send + Sync {
    /// The error type for this service.
    type Error: std::error::Error + Send + Sync + 'static;

    /// Creates a new stream and returns its unique identifier.
    fn create(&self) -> impl Future<Output = Result<StreamId, Self::Error>>;

    /// Appends an item to an existing stream.
    ///
    /// Returns the offset of the appended item.
    fn append<T>(
        &self,
        id: &StreamId,
        item: StreamItem<T>,
    ) -> impl Future<Output = Result<(), Self::Error>>
    where
        T: Serialize + Send + Sync + 'static;

    /// Reads items from a stream, optionally starting from an offset.
    ///
    /// If `offset` is `None`, reads from the beginning of the stream.
    /// If `offset` is `Some`, reads items after that offset.
    ///
    /// Returns a vector of items with their offsets.
    fn read<T>(
        &self,
        id: &StreamId,
        offset: Option<Offset>,
    ) -> impl Future<Output = Result<StreamWithOffset<T, Self::Error>, Self::Error>>
    where
        T: for<'de> Deserialize<'de> + Send + Sync + 'static;
}
