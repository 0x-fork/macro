use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use model::response::ErrorResponse;

/// Error types for GitHub integration operations
#[derive(thiserror::Error, Debug)]
pub enum GitHubIntegrationError {
    /// OAuth token exchange failed
    #[error("OAuth token exchange failed: {0}")]
    TokenExchangeFailed(String),

    /// Failed to retrieve GitHub user information
    #[error("failed to retrieve GitHub user info: {0}")]
    UserInfoFailed(String),

    /// GitHub account already linked to a different user
    #[error("GitHub account already linked to another Macro account")]
    AccountAlreadyLinked,

    /// GitHub account not linked
    #[error("GitHub account not linked")]
    NotLinked,

    /// GitHub repository not found
    #[error("GitHub repository not found")]
    RepositoryNotFound,

    /// Failed to link user in FusionAuth
    #[error("failed to link GitHub account in FusionAuth: {0}")]
    FusionAuthLinkingFailed(String),

    /// Failed to unlink user in FusionAuth
    #[error("failed to unlink GitHub account from FusionAuth: {0}")]
    FusionAuthUnlinkingFailed(String),

    /// Invalid OAuth state
    #[error("invalid OAuth state")]
    InvalidOAuthState(#[from] serde_json::Error),

    /// Missing link_id in OAuth state
    #[error("invalid OAuth flow - missing link_id")]
    MissingLinkId,

    /// Invalid or expired OAuth state
    #[error("invalid or expired OAuth state")]
    InvalidOrExpiredOAuthState,

    /// Invalid user ID format
    #[error("invalid user ID format")]
    InvalidUserId(#[from] uuid::Error),

    /// Database operation failed
    #[error("database operation failed: {0}")]
    DatabaseError(#[from] sqlx::Error),

    /// Network error during HTTP requests
    #[error("network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    /// Generic error
    #[error("{0}")]
    Generic(#[from] anyhow::Error),
}

impl IntoResponse for GitHubIntegrationError {
    fn into_response(self) -> Response {
        let (status_code, message) = match self {
            GitHubIntegrationError::AccountAlreadyLinked => {
                (StatusCode::CONFLICT, "This GitHub account is already linked to another Macro account")
            }
            GitHubIntegrationError::NotLinked => {
                (StatusCode::FORBIDDEN, "GitHub account not linked")
            }
            GitHubIntegrationError::RepositoryNotFound => {
                (StatusCode::NOT_FOUND, "GitHub repository not found")
            }
            GitHubIntegrationError::InvalidOAuthState(_) => {
                (StatusCode::BAD_REQUEST, "invalid OAuth state")
            }
            GitHubIntegrationError::MissingLinkId => {
                (StatusCode::BAD_REQUEST, "invalid OAuth flow - missing link_id")
            }
            GitHubIntegrationError::InvalidOrExpiredOAuthState => {
                (StatusCode::BAD_REQUEST, "invalid or expired OAuth state")
            }
            GitHubIntegrationError::InvalidUserId(_) => {
                (StatusCode::BAD_REQUEST, "invalid user ID format")
            }
            GitHubIntegrationError::TokenExchangeFailed(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "OAuth token exchange failed")
            }
            GitHubIntegrationError::UserInfoFailed(ref msg)
                if msg.contains("verify") || msg.contains("email") => {
                (StatusCode::BAD_REQUEST, msg.as_str())
            }
            GitHubIntegrationError::UserInfoFailed(_) => {
                (StatusCode::BAD_REQUEST, "failed to retrieve GitHub user information")
            }
            GitHubIntegrationError::FusionAuthLinkingFailed(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "unable to link GitHub account")
            }
            GitHubIntegrationError::FusionAuthUnlinkingFailed(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "unable to unlink GitHub account")
            }
            GitHubIntegrationError::DatabaseError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "database error")
            }
            GitHubIntegrationError::NetworkError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "network error")
            }
            GitHubIntegrationError::Generic(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
        };

        (
            status_code,
            Json(ErrorResponse {
                message,
            }),
        )
        .into_response()
    }
}

/// Result type for GitHub integration operations
pub type Result<T> = std::result::Result<T, GitHubIntegrationError>;
