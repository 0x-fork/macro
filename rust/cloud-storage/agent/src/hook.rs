/// A [`rig_core::agent::PromptHook`] that bridges RIG lifecycle events into
/// [`StreamPart`] items sent through a channel.
#[cfg(test)]
mod test;

use crate::AgentError;
use crate::permissions::Permission;
use crate::stream::{McpInfo, StreamPart, ToolCall, ToolResponse, Usage};
use ai_toolset::{SearchableTool, ToolInfo};
use rig_core::agent::{HookAction, PromptHook, ToolCallHookAction};
use rig_core::completion::{CompletionModel, GetTokenUsage};
use rig_core::message::Message;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Resolves a tool name to its routing [`ToolInfo`] via the session's toolset.
///
/// rig only hands the hook a tool's (mangled) name, so this closure lets the
/// bridge ask the authoritative source — [`ai_toolset::ToolSet::routing_description`]
/// — whether a call is an external/MCP tool and recover its service, original
/// name, and display name. Returns `None` for native tools.
pub type ToolRouter = Arc<dyn Fn(&str) -> Option<ToolInfo> + Send + Sync>;

/// Registers tools loaded on demand (via `SearchTools`) with the live tool
/// server so they are advertised and callable on the next turn.
///
/// Built by the agent layer (which captures the tool-server handle and the
/// session's context); context-erased so the bridge stays generic-free.
pub type RegisterFn =
    Arc<dyn Fn(Vec<SearchableTool>) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>;

/// Resolves the [`Permission`] for a tool by (mangled) name, before dispatch.
///
/// Built by the agent layer from the session's [`PermissionsRepo`] and toolset
/// (which together know each tool's annotations). Context-erased so the bridge
/// stays generic-free, mirroring [`ToolRouter`]. The bridge consults this in
/// [`PromptHook::on_tool_call`]: a [`Permission::NeedsPermission`] (or
/// `AlwaysDeny`) terminates the loop, leaving the tool call dangling so the
/// saved chain derives as suspended.
///
/// [`PermissionsRepo`]: crate::permissions::PermissionsRepo
pub type PermissionGate = Arc<dyn Fn(&str) -> Permission + Send + Sync>;

/// The reason string a permission-suspend terminates the loop with.
///
/// Distinguishes a permission-driven halt from a user cancellation so the DCS
/// layer can leave gated calls dangling (vs. synthesizing "cancelled").
pub const PERMISSION_SUSPEND_REASON: &str = "tool requires permission";

/// Whether `err` is the controlled stream termination produced by the permission
/// gate (a `Terminate` from [`StreamBridge::on_tool_call`]).
///
/// rig surfaces a [`ToolCallHookAction::Terminate`] as a
/// `PromptError::PromptCancelled` carrying our reason. The drive loop swallows
/// this (rather than yielding it as an error) so the stream ends cleanly with
/// the gated tool call left dangling — the saved chain then derives as
/// suspended.
pub fn is_permission_suspend(err: &AgentError) -> bool {
    use rig_core::agent::StreamingError;
    use rig_core::completion::PromptError;
    let AgentError::Streaming(StreamingError::Prompt(prompt_err)) = err else {
        return false;
    };
    matches!(
        prompt_err.as_ref(),
        PromptError::PromptCancelled { reason, .. } if reason == PERMISSION_SUSPEND_REASON
    )
}

/// Sends [`StreamPart`] items through an unbounded channel as the RIG agentic
/// loop produces events.
#[derive(Clone)]
pub struct StreamBridge {
    tx: mpsc::UnboundedSender<Result<StreamPart, AgentError>>,
    routing: ToolRouter,
    /// Resolves a tool's permission before dispatch. Gated tools terminate the
    /// loop, leaving the call dangling (suspended).
    permission_gate: PermissionGate,
    /// Tools the `SearchTools` tool asked to load this turn, awaiting
    /// registration. Drained in [`Self::on_tool_result`].
    loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
    /// Registers drained tools with the live tool server.
    register_loaded: RegisterFn,
}

impl StreamBridge {
    /// Create a bridge and its receiving half.
    ///
    /// `routing` resolves tool names to [`ToolInfo`] so MCP calls can be
    /// tagged as such (see [`ToolRouter`]). `loaded_buffer` / `register_loaded`
    /// power on-demand tool loading: `SearchTools` pushes matches into the
    /// buffer, and the bridge registers them after the tool result, before the
    /// next turn (see [`Self::on_tool_result`]).
    pub fn channel(
        routing: ToolRouter,
        permission_gate: PermissionGate,
        loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
        register_loaded: RegisterFn,
    ) -> (
        Self,
        mpsc::UnboundedReceiver<Result<StreamPart, AgentError>>,
    ) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                tx,
                routing,
                permission_gate,
                loaded_buffer,
                register_loaded,
            },
            rx,
        )
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
        let json = serde_json::from_str(args).unwrap_or(serde_json::Value::Null);
        let id = tool_call_id.unwrap_or_else(|| internal_call_id.to_owned());
        let mcp = (self.routing)(tool_name).map(|i| match i {
            ToolInfo::ExternalTool {
                service_name,
                tool_name,
                display_name,
            } => McpInfo {
                service: service_name,
                tool_name,
                display_name,
            },
        });
        let _ = self.tx.send(Ok(StreamPart::ToolCall(ToolCall {
            id,
            name: tool_name.to_owned(),
            json,
            mcp,
        })));

        // Permission gate, checked BEFORE dispatch. A tool that needs permission
        // (or is denied) terminates the loop, leaving this call dangling (no tool
        // result). The saved chain then derives as suspended-on-this-call and the
        // frontend prompts the user to accept / deny / cancel. The ToolCall part
        // was already streamed above so the unresolved call is rendered in place.
        if (self.permission_gate)(tool_name).requires_resolution() {
            return ToolCallHookAction::Terminate {
                reason: PERMISSION_SUSPEND_REASON.to_owned(),
            };
        }

        ToolCallHookAction::Continue
    }

    async fn on_tool_result(
        &self,
        tool_name: &str,
        tool_call_id: Option<String>,
        internal_call_id: &str,
        _args: &str,
        result: &str,
    ) -> HookAction {
        // Register any tools `SearchTools` asked to load. This fires after the
        // tool executes and before the next turn's request is built, so loaded
        // tools are advertised + callable next turn. (The lock guard is dropped
        // before the await.)
        let pending: Vec<SearchableTool> = {
            let mut buf = self.loaded_buffer.lock().expect("loaded_buffer poisoned");
            std::mem::take(&mut *buf)
        };
        if !pending.is_empty() {
            (self.register_loaded)(pending).await;
        }

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
