//! Permission domain types for the agent tool loop.
//!
//! The accept/reject mechanism is **stateless**. The agent loop never holds a
//! live channel or waits for a grant: when a tool requires permission the hook
//! terminates the RIG loop, the stream emits a
//! [`PermissionRequest`](crate::PermissionRequest) part, and the turn *ends*.
//!
//! Pending state is derived entirely from the persisted conversation chain — a
//! tool call (persisted as [`AssistantMessagePart::PermissionRequest`]) with no
//! matching tool result is a pending permission request. The chat resumes
//! through the normal chat HTTP entry point, which carries the user's
//! grant/deny decision, materializes the pending calls (executing granted ones
//! and inserting a placeholder result for denied/ignored ones), and starts a
//! fresh turn. There is no durable grant store.
//!
//! [`AssistantMessagePart::PermissionRequest`]: crate::types::AssistantMessagePart::PermissionRequest

#[cfg(test)]
mod test;

use crate::types::AssistantMessagePart;
use ai_toolset::ToolAnnotations;

/// Controls whether a tool call should proceed, require approval, or be blocked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolPermission {
    /// Execute the tool immediately without user confirmation.
    AlwaysAllow,
    /// Terminate the loop and request user confirmation.
    NeedsPermission,
    /// Filtered out of request and toolset
    Block,
}

impl ToolPermission {
    /// Derive a permission from tool annotations.
    ///
    /// - read-only tools → [`AlwaysAllow`](Self::AlwaysAllow)
    /// - everything else → [`NeedsPermission`](Self::NeedsPermission)
    pub fn from_annotations(annotations: &ToolAnnotations) -> Self {
        if annotations.read_only_hint == Some(true) {
            Self::AlwaysAllow
        } else {
            Self::NeedsPermission
        }
    }
}

/// Human-readable description recorded as the tool result when a pending tool
/// call is denied or ignored (the user never answered the permission request).
///
/// The placeholder keeps the persisted message chain valid: every tool call
/// must have a matching tool result, otherwise the provider rejects the next
/// turn. It is surfaced through the typed
/// [`AssistantMessagePart::ToolCallErr`] variant — never a raw JSON literal —
/// so it carries the originating `tool_call_id` and tool name.
pub const PERMISSION_DENIED_PLACEHOLDER: &str =
    "The user did not grant permission to run this tool. It was not executed.";

/// A tool call that was stopped because it needs permission.
///
/// Derived from the persisted conversation chain (a
/// [`AssistantMessagePart::PermissionRequest`] with no matching result), not
/// from any in-memory channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingToolCall {
    /// The provider-assigned tool call ID.
    pub tool_call_id: String,
    /// The tool name.
    pub tool_name: String,
    /// The JSON arguments the agent passed.
    pub args: serde_json::Value,
}

/// The user's decision about a single pending tool call, delivered statelessly
/// through the chat resume request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolGrant {
    /// The provider-assigned tool call ID this decision applies to.
    pub tool_call_id: String,
    /// Whether the user approved (`true`) or denied (`false`) the call.
    pub approved: bool,
}

/// Build the placeholder tool result for a pending call that was denied or
/// ignored.
///
/// Returns a valid [`AssistantMessagePart::ToolCallErr`] carrying the call's
/// `tool_call_id` and name so the persisted chain stays a well-formed provider
/// message chain (every tool call paired with a result).
pub fn denied_placeholder_part(call: &PendingToolCall) -> AssistantMessagePart {
    AssistantMessagePart::ToolCallErr {
        id: call.tool_call_id.clone(),
        name: call.tool_name.clone(),
        description: PERMISSION_DENIED_PLACEHOLDER.to_string(),
    }
}
