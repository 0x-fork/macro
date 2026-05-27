//! A [`rig_core::agent::PromptHook`] that bridges RIG lifecycle events into
//! [`StreamPart`] items sent through a channel.
//!
//! When a tool needs permission the hook terminates the RIG loop and records
//! the pending call so the stream loop can end the turn. Resuming the call is
//! handled statelessly through the chat HTTP entry point, not here.

#[cfg(test)]
mod test;

use crate::error::AgentError;
use crate::permission::{PendingToolCall, ToolPermission};
use crate::stream::{McpInfo, PermissionRequest, StreamPart, ToolCall, ToolResponse, Usage};
use ai_toolset::{ToolAnnotations, ToolInfo};
use rig_core::agent::{HookAction, PromptHook, ToolCallHookAction};
use rig_core::completion::{CompletionModel, GetTokenUsage};
use rig_core::message::Message;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Resolves a tool name to its routing [`ToolInfo`] via the session's toolset.
///
/// rig only hands the hook a tool's (mangled) name, so this closure lets the
/// bridge ask the authoritative source — [`ai_toolset::ToolSet::routing_description`]
/// — whether a call is an external/MCP tool and recover its service, original
/// name, and display name. Returns `None` for native tools.
pub type ToolRouter = Arc<dyn Fn(&str) -> Option<ToolInfo> + Send + Sync>;

/// Lookup function for tool annotations, used to decide whether a tool call
/// requires user permission.
pub(crate) type AnnotationsFn = Arc<dyn Fn(&str) -> ToolAnnotations + Send + Sync>;

/// Sends [`StreamPart`] items through an unbounded channel as the RIG agentic
/// loop produces events. When a tool needs permission the loop is terminated
/// and the pending call is recorded so the stream loop can handle it.
#[derive(Clone)]
pub struct StreamBridge {
    tx: mpsc::UnboundedSender<Result<StreamPart, AgentError>>,
    annotations_fn: AnnotationsFn,
    routing: ToolRouter,
    /// Set by the hook when a tool call triggers termination due to
    /// [`ToolPermission::NeedsPermission`]. The stream loop reads this
    /// after the RIG stream ends to decide whether to wait for a grant.
    pub(crate) pending: Arc<Mutex<Option<PendingToolCall>>>,
}

impl StreamBridge {
    /// Create a bridge with permission support and its receiving half.
    ///
    /// `annotations_fn` resolves a tool's behavioral hints (used to decide if
    /// a call needs permission). `routing` resolves tool names to [`ToolInfo`]
    /// so MCP calls can be tagged as such (see [`ToolRouter`]).
    pub fn new(
        annotations_fn: AnnotationsFn,
        routing: ToolRouter,
    ) -> (
        Self,
        mpsc::UnboundedReceiver<Result<StreamPart, AgentError>>,
    ) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                tx,
                annotations_fn,
                routing,
                pending: Arc::new(Mutex::new(None)),
            },
            rx,
        )
    }

    /// Create a bridge that allows all tools (no permission checking) and does
    /// no MCP routing. Convenience for tests and callers that don't need the
    /// permission gate.
    pub fn channel() -> (
        Self,
        mpsc::UnboundedReceiver<Result<StreamPart, AgentError>>,
    ) {
        Self::new(
            Arc::new(|_| ToolAnnotations::new().read_only(true).destructive(false)),
            Arc::new(|_| None),
        )
    }

    /// Resolve MCP routing info for a tool name.
    fn mcp_info(&self, tool_name: &str) -> Option<McpInfo> {
        (self.routing)(tool_name).map(|i| match i {
            ToolInfo::ExternalTool {
                service_name,
                tool_name,
                display_name,
            } => McpInfo {
                service: service_name,
                tool_name,
                display_name,
            },
        })
    }
}

impl<M> PromptHook<M> for StreamBridge
where
    M: CompletionModel,
    M::StreamingResponse: GetTokenUsage + Send + Sync,
{
    async fn on_text_delta(&self, text_delta: &str, _aggregated_text: &str) -> HookAction {
        let _ = self.tx.send(Ok(StreamPart::Content(text_delta.to_owned())));
        HookAction::Continue
    }

    async fn on_tool_call(
        &self,
        tool_name: &str,
        tool_call_id: Option<String>,
        internal_call_id: &str,
        args: &str,
    ) -> ToolCallHookAction {
        let id = tool_call_id.unwrap_or_else(|| internal_call_id.to_owned());
        let json = serde_json::from_str(args).unwrap_or(serde_json::Value::Null);

        let annotations = (self.annotations_fn)(tool_name);
        match ToolPermission::from_annotations(&annotations) {
            ToolPermission::AlwaysAllow => {
                let mcp = self.mcp_info(tool_name);
                let _ = self.tx.send(Ok(StreamPart::ToolCall(ToolCall {
                    id,
                    name: tool_name.to_owned(),
                    json,
                    mcp,
                })));
                ToolCallHookAction::Continue
            }
            ToolPermission::Block => ToolCallHookAction::skip("This tool is not allowed"),
            ToolPermission::NeedsPermission => {
                let _ = self
                    .tx
                    .send(Ok(StreamPart::PermissionRequest(PermissionRequest {
                        tool_call_id: id.clone(),
                        tool_name: tool_name.to_owned(),
                        args: json.clone(),
                    })));

                *self.pending.lock().expect("pending lock poisoned") = Some(PendingToolCall {
                    tool_call_id: id,
                    tool_name: tool_name.to_owned(),
                    args: json,
                });

                // Terminate rig's loop. The text here is only consumed by rig
                // to unwind the in-flight turn; it is never persisted — the
                // persisted chain is built from the emitted stream parts, and
                // the pending call is resolved statelessly on resume.
                ToolCallHookAction::terminate("permission required")
            }
        }
    }

    async fn on_tool_result(
        &self,
        tool_name: &str,
        tool_call_id: Option<String>,
        internal_call_id: &str,
        _args: &str,
        result: &str,
    ) -> HookAction {
        let id = tool_call_id.unwrap_or_else(|| internal_call_id.to_owned());
        let response = match serde_json::from_str::<serde_json::Value>(result) {
            Ok(json) => ToolResponse::Json {
                id,
                json,
                name: tool_name.to_owned(),
            },
            Err(_) => ToolResponse::Err {
                id,
                name: tool_name.to_owned(),
                description: result.to_owned(),
            },
        };
        let _ = self.tx.send(Ok(StreamPart::ToolResponse(response)));
        HookAction::Continue
    }

    async fn on_stream_completion_response_finish(
        &self,
        _prompt: &Message,
        response: &M::StreamingResponse,
    ) -> HookAction {
        if let Some(usage) = response.token_usage() {
            let _ = self.tx.send(Ok(StreamPart::Usage(Usage {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
            })));
        }
        HookAction::Continue
    }
}
