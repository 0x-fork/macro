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
    DatabaseError(#[from] sqlx::Error),

    /// Network error during HTTP requests
    #[error("network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    /// Generic error
    #[error("{0}")]
    Generic(#[from] anyhow::Error),
}

/// Result type for GitHub integration operations
pub type Result<T> = std::result::Result<T, GitHubIntegrationError>;
