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

    /// Failed to link user in FusionAuth
    #[error("failed to link GitHub account in FusionAuth: {0}")]
    FusionAuthLinkingFailed(String),

    /// Failed to unlink user in FusionAuth
    #[error("failed to unlink GitHub account from FusionAuth: {0}")]
    FusionAuthUnlinkingFailed(String),

    /// Database operation failed
    #[error("database operation failed: {0}")]
    DatabaseError(String),

    /// Generic error
    #[error("{0}")]
    Generic(String),
}

impl From<anyhow::Error> for GitHubIntegrationError {
    fn from(err: anyhow::Error) -> Self {
        GitHubIntegrationError::Generic(err.to_string())
    }
}

impl From<sqlx::Error> for GitHubIntegrationError {
    fn from(err: sqlx::Error) -> Self {
        GitHubIntegrationError::DatabaseError(err.to_string())
    }
}

impl From<reqwest::Error> for GitHubIntegrationError {
    fn from(err: reqwest::Error) -> Self {
        GitHubIntegrationError::Generic(err.to_string())
    }
}

/// Result type for GitHub integration operations
pub type Result<T> = std::result::Result<T, GitHubIntegrationError>;
