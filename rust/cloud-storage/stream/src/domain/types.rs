use thiserror::Error;

pub type Result<T> = std::result::Result<T, StreamServiceError>;

#[derive(Debug, Error)]
pub enum StreamServiceError {
    #[error("storage error {0}")]
    StorageError(String),
    #[error("serde error {0}")]
    SerdeError(serde_json::error::Error),
}

impl From<serde_json::error::Error> for StreamServiceError {
    fn from(value: serde_json::error::Error) -> Self {
        Self::SerdeError(value)
    }
}
