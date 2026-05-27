use crate::annotations::ToolAnnotations;
use crate::{RequestContext, ServiceContext};
use async_trait::async_trait;
use serde::Serialize;

/// Result type for tool calls, containing either the output or a [`ToolCallError`].
pub type ToolResult<T> = std::result::Result<T, ToolCallError>;
/// A unit type for tools that don't require any context.
pub struct NoContext();

/// Error type for failed tool calls.
///
/// Contains both an internal error for logging/debugging and a user-facing description.
#[derive(Debug)]
pub struct ToolCallError {
    /// The underlying error that caused the tool call to fail.
    pub internal_error: anyhow::Error,
    /// A human-readable description of the error suitable for returning to the AI.
    pub description: String,
}

impl std::fmt::Display for ToolCallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "description: {}. error: {}",
            self.description, self.internal_error
        )
    }
}

/// Trait for asynchronous tools that can be called by an AI model.
///
/// # Type Parameters
///
/// - `Context`: Service context type (shared state like database connections)
#[async_trait]
pub trait AsyncTool<Context>: Sync + Send {
    /// The output type produced by this tool.
    type Output: Serialize + 'static;

    /// Behavioral annotations for this tool, used by the agent loop to
    /// decide whether execution requires user confirmation.
    ///
    /// The default leaves all hints unset, which the agent loop treats
    /// as needing permission. Override with `read_only(true)` for tools
    /// that don't mutate state.
    fn annotations() -> ToolAnnotations
    where
        Self: Sized,
    {
        ToolAnnotations::default()
    }

    /// Execute the tool asynchronously with the given contexts.
    async fn call(
        &self,
        service_context: ServiceContext<Context>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output>;
}
