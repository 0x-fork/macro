use crate::domain::{StreamId, StreamServiceError};

impl From<redis::RedisError> for StreamServiceError {
    fn from(value: redis::RedisError) -> Self {
        Self::StorageError(Box::new(value))
    }
}

impl std::fmt::Display for StreamId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}-{}", self.entity_id, self.stream_id)
    }
}
