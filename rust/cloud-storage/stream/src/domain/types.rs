use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, StreamServiceError>;

#[derive(Debug, Error)]
pub enum StreamServiceError {
    #[error("storage error {0}")]
    StorageError(Box<dyn std::error::Error>),
}
