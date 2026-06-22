use crate::tool_search::{SearchableTool, ToolLoader};
use macro_user_id::user_id::MacroUserIdStr;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

/// Service context wrapper for shared state passed to tools.
///
/// This is provides access to
/// shared application state like database connections and API clients.
#[derive(Default, Debug, Clone, Copy)]
pub struct ServiceContext<S>(pub S);

impl<S> Deref for ServiceContext<S> {
    type Target = S;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S> DerefMut for ServiceContext<S> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// A single part of the assistant's response, captured as it streams so that
/// tools running mid-turn can see what the primary agent has produced so far.
///
/// This is a self-contained, dependency-free mirror of the streamed assistant
/// content (the `agent` crate maps its richer stream parts onto this). It backs
/// the "delegated tool" pattern, where a name-only tool call is fulfilled by a
/// secondary agent that needs the current assistant response as context.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssistantContextPart {
    /// Plain text produced by the assistant in this turn.
    Text(String),
    /// Reasoning / thinking text produced by the assistant in this turn.
    Thinking(String),
    /// A tool call the assistant made in this turn, rendered as
    /// `name(json-args)` for context.
    ToolCall {
        /// The tool name.
        name: String,
        /// The JSON arguments the assistant passed.
        args: serde_json::Value,
    },
}

/// Accumulates the assistant message parts of the in-flight response.
///
/// Shared (via [`Arc`]) between the agent stream — which appends parts as they
/// stream — and the [`RequestContext`] handed to tool calls, so a tool can read
/// everything the assistant has emitted in the current turn. Cleared at the
/// start of each new turn by the producer.
#[derive(Clone, Debug, Default)]
pub struct AssistantContext(Arc<RwLock<Vec<AssistantContextPart>>>);

impl AssistantContext {
    /// Create an empty assistant context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a part produced by the assistant.
    pub fn push(&self, part: AssistantContextPart) {
        if let Ok(mut parts) = self.0.write() {
            parts.push(part);
        }
    }

    /// Snapshot the parts accumulated so far in the current turn.
    pub fn snapshot(&self) -> Vec<AssistantContextPart> {
        self.0.read().map(|p| p.clone()).unwrap_or_default()
    }

    /// Render the accumulated parts as a plain-text transcript suitable for
    /// feeding to a secondary agent as context. Returns `None` if empty.
    pub fn to_transcript(&self) -> Option<String> {
        let parts = self.snapshot();
        if parts.is_empty() {
            return None;
        }
        let mut out = String::new();
        for part in parts {
            match part {
                AssistantContextPart::Text(text) => {
                    out.push_str(&text);
                    out.push('\n');
                }
                AssistantContextPart::Thinking(thinking) => {
                    out.push_str("[thinking] ");
                    out.push_str(&thinking);
                    out.push('\n');
                }
                AssistantContextPart::ToolCall { name, args } => {
                    out.push_str("[tool call] ");
                    out.push_str(&name);
                    out.push('(');
                    out.push_str(&args.to_string());
                    out.push_str(")\n");
                }
            }
        }
        Some(out)
    }
}

/// Request context passed into tool calls, containing per-request data like user identity.
#[derive(Clone, Debug)]
pub struct RequestContext {
    /// The ID of the user making the request.
    pub user_id: MacroUserIdStr<'static>,
    /// Catalog of on-demand (searchable) tools for this request, read by the
    /// `SearchTools` tool to match the model's query. Empty when the request has
    /// no searchable tools.
    pub searchable_tools: Arc<Vec<SearchableTool>>,
    /// Loader used by `SearchTools` to load matched tools into the active
    /// request. `None` when tool search is not wired up (e.g. non-agent callers).
    pub tool_loader: Option<ToolLoader>,
    /// The assistant message parts produced so far in the current response.
    ///
    /// Populated by the agent stream as the assistant generates; read by tools
    /// (e.g. delegated tools) that need the current response as context. Empty
    /// for non-streaming dispatch paths.
    pub assistant_context: AssistantContext,
}

impl RequestContext {
    /// Create a request context for `user_id` with no tool-search wiring (no
    /// searchable catalog, no loader) and an empty assistant context.
    ///
    /// Use this on non-streaming dispatch paths (single tool calls outside the
    /// agent loop) where no in-flight assistant response exists.
    pub fn new(user_id: MacroUserIdStr<'static>) -> Self {
        Self {
            user_id,
            searchable_tools: Arc::new(Vec::new()),
            tool_loader: None,
            assistant_context: AssistantContext::new(),
        }
    }

    /// Attach the searchable-tool catalog and loader that power `SearchTools`.
    pub fn with_tool_search(
        mut self,
        searchable_tools: Arc<Vec<SearchableTool>>,
        tool_loader: ToolLoader,
    ) -> Self {
        self.searchable_tools = searchable_tools;
        self.tool_loader = Some(tool_loader);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_assistant_context_has_no_transcript() {
        assert_eq!(AssistantContext::new().to_transcript(), None);
    }

    #[test]
    fn transcript_renders_parts_in_order() {
        let ctx = AssistantContext::new();
        ctx.push(AssistantContextPart::Text("found 3 results".into()));
        ctx.push(AssistantContextPart::ToolCall {
            name: "Search".into(),
            args: serde_json::json!({ "query": "macro" }),
        });
        let transcript = ctx.to_transcript().expect("non-empty");
        assert!(transcript.contains("found 3 results"));
        assert!(transcript.contains("[tool call] Search("));
        assert!(transcript.contains("macro"));
    }
}
