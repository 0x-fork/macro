//! Stateless resume of a chat that suspended on a tool-permission request.
//!
//! When a streamed turn hits a tool that needs permission, the agent loop emits
//! a `PermissionRequest` part and the turn ends. The pending state lives only in
//! the persisted conversation chain: an [`AssistantMessagePart::PermissionRequest`]
//! with no matching tool result. There is no durable grant store and no live
//! channel.
//!
//! The chat resumes through the normal chat HTTP entry point. The resume request
//! carries the user's [`ToolGrantDecision`]s. This module materializes those
//! decisions into the message chain: each pending `PermissionRequest` becomes a
//! real tool call followed by a tool result — the actual result for granted
//! calls (executed here against the toolset) or a placeholder result for denied
//! or ignored calls. The placeholder keeps the chain a valid provider message
//! chain (every tool call paired with a result, carrying the originating
//! `tool_call_id`) so the conversation can continue even if the user never
//! answered.

#[cfg(test)]
mod test;

use super::ToolGrantDecision;
use agent::denied_placeholder_part;
use agent::types::AssistantMessagePart;
use ai_toolset::{RequestContext, ToolSet as AiToolSet};
use std::collections::HashMap;
use std::sync::Arc;

/// A pending permission request found in a persisted assistant message.
struct PendingPart {
    tool_call_id: String,
    tool_name: String,
    json: serde_json::Value,
    /// MCP routing info, present when this is an external/MCP tool call.
    mcp: Option<(String, Option<String>)>,
}

/// Whether a set of assistant-message parts contains any unresolved permission
/// request (a `PermissionRequest` part).
pub fn has_pending_permission(parts: &[AssistantMessagePart]) -> bool {
    parts
        .iter()
        .any(|p| matches!(p, AssistantMessagePart::PermissionRequest { .. }))
}

/// Resolve the pending permission requests in `parts` against the user's
/// `decisions`, executing granted tools against `toolset`.
///
/// Returns the rewritten parts with every `PermissionRequest` replaced by a
/// real tool call plus its result, suitable for persisting back onto the
/// assistant message and for replaying to the provider. Pending calls with no
/// matching decision are treated as denied.
pub async fn resolve_permission_grants<Context>(
    parts: Vec<AssistantMessagePart>,
    decisions: &[ToolGrantDecision],
    toolset: &Arc<dyn AiToolSet<Context> + Send + Sync>,
    context: &Context,
    request_context: &RequestContext,
) -> Vec<AssistantMessagePart>
where
    Context: Clone + Send + Sync + 'static,
{
    let approved: HashMap<&str, bool> = decisions
        .iter()
        .map(|d| (d.tool_call_id.as_str(), d.approved))
        .collect();

    let mut out: Vec<AssistantMessagePart> = Vec::with_capacity(parts.len());
    for part in parts {
        let AssistantMessagePart::PermissionRequest { name, json, id } = &part else {
            out.push(part);
            continue;
        };

        let pending = PendingPart {
            tool_call_id: id.clone(),
            tool_name: name.clone(),
            json: json.clone(),
            mcp: toolset.routing_description(name).map(|info| match info {
                ai_toolset::ToolInfo::ExternalTool {
                    service_name,
                    display_name,
                    ..
                } => (service_name, display_name),
            }),
        };

        // Re-materialize the tool call so `to_rig_messages` produces a provider
        // tool call (with no result) that the appended result then satisfies.
        let call_part = match &pending.mcp {
            Some((service, display_name)) => AssistantMessagePart::McpToolCall {
                name: pending.tool_name.clone(),
                service: service.clone(),
                display_name: display_name.clone(),
                json: pending.json.clone(),
                id: pending.tool_call_id.clone(),
            },
            None => AssistantMessagePart::ToolCall {
                name: pending.tool_name.clone(),
                json: pending.json.clone(),
                id: pending.tool_call_id.clone(),
            },
        };

        let result_part = if approved.get(pending.tool_call_id.as_str()).copied() == Some(true) {
            execute_granted(&pending, toolset, context, request_context).await
        } else {
            // Denied or ignored: insert a valid placeholder result so the chain
            // stays well-formed.
            denied_placeholder_part(&agent::PendingToolCall {
                tool_call_id: pending.tool_call_id.clone(),
                tool_name: pending.tool_name.clone(),
                args: pending.json.clone(),
            })
        };

        out.push(call_part);
        out.push(result_part);
    }
    out
}

/// Execute a granted tool against the toolset and convert the outcome into the
/// appropriate result part.
async fn execute_granted<Context>(
    pending: &PendingPart,
    toolset: &Arc<dyn AiToolSet<Context> + Send + Sync>,
    context: &Context,
    request_context: &RequestContext,
) -> AssistantMessagePart
where
    Context: Clone + Send + Sync + 'static,
{
    match toolset
        .try_tool_call(
            context.clone(),
            request_context.clone(),
            &pending.tool_name,
            &pending.json,
        )
        .await
    {
        Ok(Ok(value)) => AssistantMessagePart::ToolCallResponseJson {
            name: pending.tool_name.clone(),
            json: value,
            id: pending.tool_call_id.clone(),
        },
        Ok(Err(e)) => AssistantMessagePart::ToolCallErr {
            name: pending.tool_name.clone(),
            description: e.description,
            id: pending.tool_call_id.clone(),
        },
        Err(e) => AssistantMessagePart::ToolCallErr {
            name: pending.tool_name.clone(),
            description: e.to_string(),
            id: pending.tool_call_id.clone(),
        },
    }
}
