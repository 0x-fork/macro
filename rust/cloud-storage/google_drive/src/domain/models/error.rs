//! Error type for the Google Drive integration.

/// Errors surfaced by the Google Drive domain services.
#[derive(Debug, thiserror::Error)]
pub enum GoogleDriveError {
    /// The user has not connected a Google Drive account.
    #[error("no google drive link found")]
    NoLinkFound,
    /// The stored refresh token is invalid/revoked; the user must reconnect.
    #[error("google drive reauthentication required")]
    ReauthenticationRequired,
    /// A requested Drive file/folder does not exist or is not accessible.
    #[error("google drive resource not found")]
    NotFound,
    /// The Google Drive API returned an unexpected error.
    #[error("google drive api error: {0}")]
    DriveApi(String),
    /// An internal error occurred.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}
