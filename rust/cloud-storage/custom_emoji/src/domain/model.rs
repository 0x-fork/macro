//! Domain models and error types for custom emoji.

use chrono::{DateTime, Utc};
use uuid::Uuid;

/// A team's custom emoji. The image bytes live in the static file service,
/// referenced by `sfs_file_id`; `slug` is what members type.
#[derive(Debug, Clone)]
pub struct CustomEmoji {
    /// Immutable id referenced by messages (stable across slug renames / teams).
    pub id: Uuid,
    /// The owning team.
    pub team_id: Uuid,
    /// The `:slug:` name, unique per team while not deleted.
    pub slug: String,
    /// Static-file-service file id for the image; the URL is derived from this.
    pub sfs_file_id: String,
    /// User who uploaded the emoji.
    pub created_by: String,
    /// When the emoji was created.
    pub created_at: DateTime<Utc>,
}

/// Generic custom-emoji errors (reads / storage failures).
#[derive(Debug, thiserror::Error)]
pub enum CustomEmojiError {
    /// Underlying storage failure.
    #[error("storage layer error: {0}")]
    StorageLayerError(#[from] anyhow::Error),
}

/// Errors when creating a custom emoji.
#[derive(Debug, thiserror::Error)]
pub enum CreateCustomEmojiError {
    /// The slug failed validation (format/length).
    #[error("invalid slug: {0}")]
    InvalidSlug(String),
    /// The caller is not a member of the target team.
    #[error("not a member of team {0}")]
    NotTeamMember(Uuid),
    /// An active emoji with this slug already exists for the team.
    #[error("slug already in use for this team")]
    SlugAlreadyExists,
    /// A generic custom-emoji error (e.g. the membership lookup failed).
    #[error(transparent)]
    Repo(#[from] CustomEmojiError),
    /// Underlying storage failure.
    #[error("storage layer error: {0}")]
    StorageLayerError(#[from] anyhow::Error),
}

/// Errors when deleting a custom emoji.
#[derive(Debug, thiserror::Error)]
pub enum DeleteCustomEmojiError {
    /// No active emoji with that id is owned by one of the caller's teams.
    #[error("custom emoji not found")]
    NotFound,
    /// Underlying storage failure.
    #[error("storage layer error: {0}")]
    StorageLayerError(#[from] anyhow::Error),
}
