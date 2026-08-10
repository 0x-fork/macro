use crate::{RequestContext, ServiceContext};
use async_trait::async_trait;
use serde::Serialize;

/// Result type for tool calls, containing either the output or a [`ToolCallError`].
pub type ToolResult<T> = std::result::Result<T, ToolCallError>;
/// A unit type for tools that don't require any context.
pub struct NoContext();

/// Behavior annotations for a tool, mirroring the MCP tool annotation hints
/// (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
///
/// These are hints for clients — the MCP server forwards them so clients like
/// Claude can decide when to ask the user for confirmation before running a
/// tool. They must never be used to make security decisions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ToolAnnotations {
    /// The tool only reads state and does not modify its environment.
    pub read_only: bool,
    /// The tool may overwrite or delete existing data, as opposed to
    /// performing purely additive updates. Only meaningful when `read_only`
    /// is `false`.
    pub destructive: bool,
    /// Repeated calls with identical arguments have no additional effect.
    pub idempotent: bool,
    /// The tool interacts with an "open world" of external entities outside
    /// the Macro workspace (e.g. the public internet).
    pub open_world: bool,
}

impl ToolAnnotations {
    /// A tool that only reads state.
    pub const fn read_only() -> Self {
        Self {
            read_only: true,
            destructive: false,
            idempotent: true,
            open_world: false,
        }
    }

    /// A tool that writes state but never irreversibly overwrites or deletes
    /// user data (creating entities, sending messages, toggling reversible
    /// state).
    pub const fn write() -> Self {
        Self {
            read_only: false,
            destructive: false,
            idempotent: false,
            open_world: false,
        }
    }

    /// A tool whose writes can destroy or irreversibly change existing data
    /// (deletes, in-place edits, arbitrary code execution).
    pub const fn destructive_write() -> Self {
        Self {
            read_only: false,
            destructive: true,
            idempotent: false,
            open_world: false,
        }
    }

    /// Marks repeated calls with identical arguments as having no additional
    /// effect.
    pub const fn idempotent(mut self) -> Self {
        self.idempotent = true;
        self
    }

    /// Marks the tool as interacting with systems outside the Macro
    /// workspace.
    pub const fn open_world(mut self) -> Self {
        self.open_world = true;
        self
    }
}

impl Default for ToolAnnotations {
    /// Conservative default: a non-idempotent, potentially destructive write.
    fn default() -> Self {
        Self::destructive_write()
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

    /// Behavior annotations for this tool.
    ///
    /// Defaults to the conservative [`ToolAnnotations::default`] (a
    /// potentially destructive write). Every production tool should override
    /// this with accurate annotations — MCP clients use them to decide when
    /// to ask the user for confirmation.
    fn annotations() -> ToolAnnotations
    where
        Self: Sized,
    {
        ToolAnnotations::default()
    }
}
