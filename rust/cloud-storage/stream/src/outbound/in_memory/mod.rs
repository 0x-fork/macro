//! In-memory implementation of the stream service.
//!
//! This implementation prioritizes correctness and readability over performance.
//! It uses simple data structures and straightforward logic to make the code
//! easy to understand and verify.

use crate::domain::traits::{
    Offset, StreamId, StreamItem, StreamService, StreamWithOffset, WithOffset,
};
use futures::stream;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use thiserror::Error;

/// Errors that can occur when using the in-memory stream store.
#[derive(Debug, Error)]
pub enum InMemoryError {
    /// The requested stream was not found.
    #[error("stream not found: {0}")]
    StreamNotFound(StreamId),

    /// The provided offset was invalid or not found in the stream.
    #[error("invalid offset: {0}")]
    InvalidOffset(Offset),

    /// Failed to serialize an item.
    #[error("serialization error: {0}")]
    SerializationError(String),

    /// Failed to deserialize an item.
    #[error("deserialization error: {0}")]
    DeserializationError(String),

    /// Internal lock error.
    #[error("internal error: lock poisoned")]
    LockPoisoned,
}

/// A single entry stored in a stream.
#[derive(Debug, Clone)]
struct StreamEntry {
    /// The offset of this entry (1-based index).
    offset: Offset,
    /// The serialized data stored as JSON bytes.
    data: Vec<u8>,
}

/// The internal state of a single stream.
#[derive(Debug, Default)]
struct StreamData {
    /// All entries in this stream, in order of insertion.
    entries: Vec<StreamEntry>,
}

/// An in-memory implementation of the stream service.
///
/// This implementation stores all streams in memory using a simple HashMap.
/// It is thread-safe but not optimized for high concurrency.
///
/// Streams are stored as vectors of JSON-serialized entries, where each entry
/// has an offset that is simply its 1-based index in the vector.
pub struct InMemoryStreamStore {
    /// All streams, keyed by stream ID.
    streams: Mutex<HashMap<StreamId, StreamData>>,
}

impl InMemoryStreamStore {
    /// Creates a new empty in-memory stream store.
    pub fn new() -> Self {
        Self {
            streams: Mutex::new(HashMap::new()),
        }
    }

    fn read_items<T>(
        &self,
        id: &StreamId,
        offset: Option<Offset>,
    ) -> Result<StreamWithOffset<T, InMemoryError>, InMemoryError>
    where
        T: for<'de> Deserialize<'de> + Send + Sync + 'static,
    {
        let streams = self
            .streams
            .lock()
            .map_err(|_| InMemoryError::LockPoisoned)?;

        let stream_data = streams
            .get(id)
            .ok_or_else(|| InMemoryError::StreamNotFound(id.clone()))?;

        let start_index = match offset {
            None => 0,
            Some(offset) => {
                if offset == 0 || offset > stream_data.entries.len() {
                    return Err(InMemoryError::InvalidOffset(offset));
                }
                offset
            }
        };

        let items: Result<Vec<WithOffset<StreamItem<T>>>, InMemoryError> = stream_data
            .entries
            .iter()
            .skip(start_index)
            .map(|entry| {
                let item: StreamItem<T> = serde_json::from_slice(&entry.data)
                    .map_err(|e| InMemoryError::DeserializationError(e.to_string()))?;
                Ok(WithOffset {
                    item,
                    offset: entry.offset,
                })
            })
            .collect();

        let items = items?;
        let result_stream = stream::iter(items.into_iter().map(Ok));

        Ok(Box::new(result_stream))
    }
}

impl Default for InMemoryStreamStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamService for InMemoryStreamStore {
    type Error = InMemoryError;

    async fn create(&self) -> Result<StreamId, Self::Error> {
        let stream_id = uuid::Uuid::new_v4().to_string();

        let mut streams = self
            .streams
            .lock()
            .map_err(|_| InMemoryError::LockPoisoned)?;
        streams.insert(stream_id.clone(), StreamData::default());

        Ok(stream_id)
    }

    async fn append<T>(&self, id: &StreamId, item: StreamItem<T>) -> Result<(), Self::Error>
    where
        T: Serialize + Send + Sync + 'static,
    {
        let data = serde_json::to_vec(&item)
            .map_err(|e| InMemoryError::SerializationError(e.to_string()))?;

        let mut streams = self
            .streams
            .lock()
            .map_err(|_| InMemoryError::LockPoisoned)?;

        let stream_data = streams
            .get_mut(id)
            .ok_or_else(|| InMemoryError::StreamNotFound(id.clone()))?;

        let offset = stream_data.entries.len() + 1;

        let entry = StreamEntry { offset, data };
        stream_data.entries.push(entry);
        Ok(())
    }

    async fn read<T>(
        &self,
        id: &StreamId,
        offset: Option<Offset>,
    ) -> Result<StreamWithOffset<T, Self::Error>, Self::Error>
    where
        T: for<'de> Deserialize<'de> + Send + Sync + 'static,
    {
        let result = self.read_items::<T>(id, offset);
        result
    }
}

#[cfg(test)]
mod test;
