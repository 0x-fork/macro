use crate::{RequestContext, ServiceContext};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Result type for tool calls, containing either the output or a [`ToolCallError`].
pub type ToolResult<T> = std::result::Result<T, ToolCallError>;
/// A unit type for tools that don't require any context.
pub struct NoContext();

/// MCP-style behavioural hints about a tool.
///
/// These mirror the [Model Context Protocol `ToolAnnotations`] shape so we can
/// both (a) derive default permissions from a tool's hints and (b) advertise
/// our own tools' hints to external MCP consumers. Every field is optional; an
/// absent hint means "unknown / use the consumer's default".
///
/// The field this crate cares about most is [`destructive_hint`]: the
/// permission layer treats a tool whose `destructive_hint == Some(true)` as
/// requiring explicit user permission before it runs.
///
/// [Model Context Protocol `ToolAnnotations`]: https://modelcontextprotocol.io/
/// [`destructive_hint`]: ToolAnnotations::destructive_hint
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    /// A human-readable title for the tool, if different from its name.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub title: Option<String>,
    /// If `Some(true)`, the tool does not modify its environment (read-only).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub read_only_hint: Option<bool>,
    /// If `Some(true)`, the tool may perform destructive updates (for tools that
    /// are not read-only). This is the hint the permission layer keys on: a
    /// destructive tool requires explicit user permission before it runs.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub destructive_hint: Option<bool>,
    /// If `Some(true)`, repeated calls with the same arguments have no
    /// additional effect (for tools that are not read-only).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub idempotent_hint: Option<bool>,
    /// If `Some(true)`, the tool may interact with an "open world" of external
    /// entities (e.g. the web).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub open_world_hint: Option<bool>,
}

impl ToolAnnotations {
    /// Whether this tool is destructive. Defaults to non-destructive (`false`)
    /// when the hint is absent — Macro's tools are non-destructive unless they
    /// explicitly opt in.
    pub fn is_destructive(&self) -> bool {
        self.destructive_hint.unwrap_or(false)
    }

    /// Builder: mark this tool as destructive.
    pub fn destructive() -> Self {
        Self {
            destructive_hint: Some(true),
            ..Default::default()
        }
    }
}

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

    /// Execute the tool asynchronously with the given contexts.
    async fn call(
        &self,
        service_context: ServiceContext<Context>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output>;

    /// MCP-style behavioural hints for this tool.
    ///
    /// Defaults to non-destructive (an empty [`ToolAnnotations`]). Tools that
    /// modify external state should override this to return
    /// [`ToolAnnotations::destructive`] so the permission layer gates them.
    fn annotations() -> ToolAnnotations
    where
        Self: Sized,
    {
        ToolAnnotations::default()
    }
}
