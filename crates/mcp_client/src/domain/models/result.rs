use thiserror::Error;

/// Domain errors for the MCP client.
#[derive(Debug, Error)]
pub enum Error {
    /// The requested tool was not found on any connected server.
    #[error("unknown tool: {0}")]
    UnknownTool(String),
    /// A tool invocation failed.
    #[error("tool call failed: {0}")]
    ToolCall(String),
    /// An internal or infrastructure error.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// Domain result type.
pub type Result<T> = std::result::Result<T, Error>;
