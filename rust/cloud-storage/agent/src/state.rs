//! Message-chain state and permission-resolution transitions.
//!
//! The suspended/ready state of a chat is **derived** from the saved message
//! chain — there is no separate stored state and no migration. A chain that
//! contains a tool call with no matching tool result (a "dangling" call) is
//! [`MessageChainState::Suspended`]; otherwise it is
//! [`MessageChainState::Ready`]. This is exactly the "invalid provider request"
//! state the original ticket describes (such a chain would be rejected by a
//! provider), so the message chain is the single source of truth.
//!
//! Resolution is a pure function of the chain plus a [`ResolutionEvent`]:
//! [`transition_suspended`] applies the user's accept / deny / cancel decisions,
//! re-derives the state, and reports whether the loop should resume.

use crate::types::AssistantMessagePart;
use std::collections::HashSet;

/// A tool call awaiting permission resolution.
///
/// The call itself already lives in the message chain (this is a *reference* to
/// it, by id), so the renderer can show it in place and mark it unresolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnresolvedCall {
    /// The provider-assigned tool call id.
    pub id: String,
    /// The tool name.
    pub name: String,
}

/// The derived state of a message chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageChainState {
    /// Every tool call in the chain has a matching result. A new user message
    /// may be sent.
    Ready,
    /// One or more tool calls are dangling (no matching result), awaiting user
    /// permission. No new user message may be sent until they are resolved.
    Suspended {
        /// The unresolved calls, in chain order.
        unresolved: Vec<UnresolvedCall>,
    },
}

impl MessageChainState {
    /// Whether the chain is ready (a new user message may be sent).
    pub fn is_ready(&self) -> bool {
        matches!(self, MessageChainState::Ready)
    }

    /// Whether the chain is suspended (awaiting permission resolution).
    pub fn is_suspended(&self) -> bool {
        matches!(self, MessageChainState::Suspended { .. })
    }
}

/// Derive the [`MessageChainState`] from a flat sequence of assistant parts.
///
/// A tool call (`ToolCall` / `McpToolCall`) with no later matching
/// `ToolCallResponseJson` / `ToolCallErr` (by id) is dangling. The chain is
/// [`MessageChainState::Suspended`] over the dangling calls (in order),
/// otherwise [`MessageChainState::Ready`].
pub fn derive_state(parts: &[AssistantMessagePart]) -> MessageChainState {
    let mut resolved: HashSet<&str> = HashSet::new();
    for part in parts {
        match part {
            AssistantMessagePart::ToolCallResponseJson { id, .. }
            | AssistantMessagePart::ToolCallErr { id, .. } => {
                resolved.insert(id.as_str());
            }
            _ => {}
        }
    }

    let mut unresolved = Vec::new();
    for part in parts {
        match part {
            AssistantMessagePart::ToolCall { id, name, .. }
            | AssistantMessagePart::McpToolCall { id, name, .. } => {
                if !resolved.contains(id.as_str()) {
                    unresolved.push(UnresolvedCall {
                        id: id.clone(),
                        name: name.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    if unresolved.is_empty() {
        MessageChainState::Ready
    } else {
        MessageChainState::Suspended { unresolved }
    }
}

/// The outcome of an accepted tool call: the result to splice into the chain.
///
/// Execution is performed by the caller (the agent / DCS layer runs the tool
/// via `try_tool_call`) and the result is handed back here so the transition
/// itself stays a pure function of the chain.
#[derive(Debug, Clone)]
pub enum AcceptResult {
    /// The tool ran and returned JSON (this includes a user tool's
    /// `PendingUserExecution` placeholder — that *is* a tool response, so the
    /// chain leaves `Suspended`; the user tool's own pending-ness is tracked
    /// separately by `UserToolResponse`).
    Json(serde_json::Value),
    /// The tool ran and failed; surfaced as a `ToolCallErr`.
    Err(String),
}

/// A per-call decision within a [`ResolutionEvent::Batch`].
#[derive(Debug, Clone)]
pub enum ToolDecision {
    /// Run the tool: splice its result in after the call.
    Accept {
        /// The id of the tool call being accepted.
        call_id: String,
        /// The executed tool's result.
        result: AcceptResult,
    },
    /// Reject the tool: splice a "denied" `ToolCallErr` in after the call. The
    /// model sees the denial and can react.
    Deny {
        /// The id of the tool call being denied.
        call_id: String,
    },
}

impl ToolDecision {
    fn call_id(&self) -> &str {
        match self {
            ToolDecision::Accept { call_id, .. } | ToolDecision::Deny { call_id } => call_id,
        }
    }
}

/// A resolution event applied to a suspended chain.
#[derive(Debug, Clone)]
pub enum ResolutionEvent {
    /// A batch of per-call accept/deny decisions. May cover only some of the
    /// pending calls — the rest stay dangling and the chain re-derives as
    /// `Suspended` (partial resolution).
    Batch(Vec<ToolDecision>),
    /// Cancel everything: resolve *all* pending calls as cancelled. Always ends
    /// `Ready` and never resumes the loop.
    Cancel,
}

/// The denial description spliced in for a `Deny` decision.
const DENIED_DESCRIPTION: &str = "denied";
/// The cancellation description spliced in for a `Cancel` event.
const CANCELLED_DESCRIPTION: &str = "cancelled";

/// The result of applying a [`ResolutionEvent`] to a suspended chain.
#[derive(Debug, Clone)]
pub struct TransitionOutcome {
    /// The new message-part chain with resolutions spliced in.
    pub parts: Vec<AssistantMessagePart>,
    /// The re-derived state after applying the resolutions.
    pub state: MessageChainState,
    /// Whether the agent loop should resume streaming.
    ///
    /// `true` iff the re-derived chain is `Ready` **and** the event was not a
    /// `Cancel`. A partial batch that leaves calls dangling re-derives as
    /// `Suspended`, so `resume` is `false` and the caller re-prompts for the
    /// remainder.
    pub resume: bool,
}

/// Apply `event` to a chain, splicing resolutions in after their calls,
/// re-deriving the state, and reporting whether to resume.
///
/// Resolution semantics:
/// - **accept** → splice the executed result (`ToolCallResponseJson` or
///   `ToolCallErr`) after the call.
/// - **deny** → splice a `ToolCallErr { description: "denied" }` after the call.
/// - **cancel** → splice a `ToolCallErr { description: "cancelled" }` after
///   *every* still-pending call.
///
/// A decision targeting an unknown or already-resolved call id is a no-op (it
/// matches no dangling call). Resume collapses to: re-derived chain is `Ready`
/// and the event was not a cancel.
pub fn transition_suspended(
    parts: Vec<AssistantMessagePart>,
    event: ResolutionEvent,
) -> TransitionOutcome {
    // The set of call ids still dangling before applying the event.
    let pending: HashSet<String> = match derive_state(&parts) {
        MessageChainState::Ready => HashSet::new(),
        MessageChainState::Suspended { unresolved } => {
            unresolved.into_iter().map(|c| c.id).collect()
        }
    };

    let is_cancel = matches!(event, ResolutionEvent::Cancel);

    // Map each *pending* call id to the resolution part to splice in after it.
    let mut resolutions: std::collections::HashMap<String, AssistantMessagePart> =
        std::collections::HashMap::new();

    match event {
        ResolutionEvent::Batch(decisions) => {
            for decision in decisions {
                let call_id = decision.call_id().to_string();
                // Ignore decisions for calls that aren't pending (unknown /
                // already-resolved): no-op.
                if !pending.contains(&call_id) {
                    continue;
                }
                let name = call_name(&parts, &call_id).unwrap_or_default();
                let resolution = match decision {
                    ToolDecision::Accept { result, .. } => match result {
                        AcceptResult::Json(json) => AssistantMessagePart::ToolCallResponseJson {
                            name,
                            json,
                            id: call_id.clone(),
                        },
                        AcceptResult::Err(description) => AssistantMessagePart::ToolCallErr {
                            name,
                            description,
                            id: call_id.clone(),
                        },
                    },
                    ToolDecision::Deny { .. } => AssistantMessagePart::ToolCallErr {
                        name,
                        description: DENIED_DESCRIPTION.to_string(),
                        id: call_id.clone(),
                    },
                };
                resolutions.insert(call_id, resolution);
            }
        }
        ResolutionEvent::Cancel => {
            for call_id in &pending {
                let name = call_name(&parts, call_id).unwrap_or_default();
                resolutions.insert(
                    call_id.clone(),
                    AssistantMessagePart::ToolCallErr {
                        name,
                        description: CANCELLED_DESCRIPTION.to_string(),
                        id: call_id.clone(),
                    },
                );
            }
        }
    }

    // Splice each resolution immediately after its matching call.
    let mut out: Vec<AssistantMessagePart> = Vec::with_capacity(parts.len() + resolutions.len());
    for part in parts {
        let resolution = match &part {
            AssistantMessagePart::ToolCall { id, .. }
            | AssistantMessagePart::McpToolCall { id, .. } => resolutions.remove(id),
            _ => None,
        };
        out.push(part);
        if let Some(r) = resolution {
            out.push(r);
        }
    }

    let state = derive_state(&out);
    let resume = state.is_ready() && !is_cancel;

    TransitionOutcome {
        parts: out,
        state,
        resume,
    }
}

/// The tool name for the call with `call_id`, if present in `parts`.
fn call_name(parts: &[AssistantMessagePart], call_id: &str) -> Option<String> {
    parts.iter().find_map(|part| match part {
        AssistantMessagePart::ToolCall { id, name, .. }
        | AssistantMessagePart::McpToolCall { id, name, .. }
            if id == call_id =>
        {
            Some(name.clone())
        }
        _ => None,
    })
}

#[cfg(test)]
mod test;
