//! Error type shared across the coding-agent ports and service.

/// Convenience alias for results in this crate.
pub type Result<T> = std::result::Result<T, CodingError>;

/// Errors raised while provisioning sandboxes or driving a coding agent.
#[derive(Debug, thiserror::Error)]
pub enum CodingError {
    /// No repository has been selected for the chat yet.
    #[error("no repository selected for this chat")]
    NoRepositorySelected,

    /// The user does not have GitHub credentials available (the GitHub
    /// integration is not linked).
    #[error("no git credentials available for user {user_id}")]
    MissingCredentials {
        /// The macro user id that lacks credentials.
        user_id: String,
    },

    /// The sandbox provider failed (provision/warm/snapshot/stop).
    #[error("sandbox provider error: {0}")]
    Sandbox(String),

    /// The coding agent inside the sandbox failed.
    #[error("coding agent error: {0}")]
    Agent(String),

    /// Persisting or reading the chat ↔ sandbox mapping failed.
    #[error("sandbox registry error: {0}")]
    Registry(String),

    /// A lower-level error that does not fit the categories above.
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl CodingError {
    /// Build a [`CodingError::Sandbox`] from anything displayable.
    pub fn sandbox(msg: impl std::fmt::Display) -> Self {
        Self::Sandbox(msg.to_string())
    }

    /// Build a [`CodingError::Agent`] from anything displayable.
    pub fn agent(msg: impl std::fmt::Display) -> Self {
        Self::Agent(msg.to_string())
    }

    /// Build a [`CodingError::Registry`] from anything displayable.
    pub fn registry(msg: impl std::fmt::Display) -> Self {
        Self::Registry(msg.to_string())
    }
}
