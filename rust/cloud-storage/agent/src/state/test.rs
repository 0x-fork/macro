use super::*;
use crate::types::AssistantMessagePart;

fn text(s: &str) -> AssistantMessagePart {
    AssistantMessagePart::Text { text: s.into() }
}

fn call(id: &str, name: &str) -> AssistantMessagePart {
    AssistantMessagePart::ToolCall {
        name: name.into(),
        json: serde_json::json!({}),
        id: id.into(),
    }
}

fn mcp_call(id: &str, name: &str) -> AssistantMessagePart {
    AssistantMessagePart::McpToolCall {
        name: name.into(),
        service: "svc".into(),
        display_name: None,
        json: serde_json::json!({}),
        id: id.into(),
    }
}

fn response(id: &str, name: &str) -> AssistantMessagePart {
    AssistantMessagePart::ToolCallResponseJson {
        name: name.into(),
        json: serde_json::json!({ "ok": true }),
        id: id.into(),
    }
}

fn ids(state: &MessageChainState) -> Vec<String> {
    match state {
        MessageChainState::Ready => vec![],
        MessageChainState::Suspended { unresolved } => {
            unresolved.iter().map(|c| c.id.clone()).collect()
        }
    }
}

fn resolution_descriptions(parts: &[AssistantMessagePart]) -> Vec<(String, Option<String>)> {
    parts
        .iter()
        .filter_map(|p| match p {
            AssistantMessagePart::ToolCallErr {
                id, description, ..
            } => Some((id.clone(), Some(description.clone()))),
            AssistantMessagePart::ToolCallResponseJson { id, .. } => Some((id.clone(), None)),
            _ => None,
        })
        .collect()
}

// --- derive_state ---

#[test]
fn derive_no_tool_calls_is_ready() {
    let parts = vec![text("hello")];
    assert_eq!(derive_state(&parts), MessageChainState::Ready);
}

#[test]
fn derive_all_resolved_is_ready() {
    let parts = vec![call("a", "T"), response("a", "T")];
    assert_eq!(derive_state(&parts), MessageChainState::Ready);
}

#[test]
fn derive_one_dangling_is_suspended_on_that() {
    let parts = vec![call("a", "T"), response("a", "T"), call("b", "D")];
    let state = derive_state(&parts);
    assert_eq!(ids(&state), vec!["b".to_string()]);
}

#[test]
fn derive_many_dangling_is_suspended_on_all_in_order() {
    let parts = vec![call("a", "A"), call("b", "B"), call("c", "C")];
    let state = derive_state(&parts);
    assert_eq!(
        ids(&state),
        vec!["a".to_string(), "b".to_string(), "c".to_string()]
    );
}

#[test]
fn derive_mcp_call_counts_as_a_call() {
    let parts = vec![mcp_call("x", "mcp__svc__do")];
    let state = derive_state(&parts);
    assert_eq!(ids(&state), vec!["x".to_string()]);
}

// --- transition_suspended: accept ---

#[test]
fn accept_all_becomes_ready_and_resumes() {
    let parts = vec![call("a", "A"), call("b", "B")];
    let event = ResolutionEvent::Batch(vec![
        ToolDecision::Accept {
            call_id: "a".into(),
            result: AcceptResult::Json(serde_json::json!({"r": 1})),
        },
        ToolDecision::Accept {
            call_id: "b".into(),
            result: AcceptResult::Json(serde_json::json!({"r": 2})),
        },
    ]);
    let out = transition_suspended(parts, event);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(out.resume);
    // results spliced directly after their calls
    assert!(matches!(
        out.parts[1],
        AssistantMessagePart::ToolCallResponseJson { ref id, .. } if id == "a"
    ));
    assert!(matches!(
        out.parts[3],
        AssistantMessagePart::ToolCallResponseJson { ref id, .. } if id == "b"
    ));
}

#[test]
fn accept_partial_stays_suspended_on_remaining_and_no_resume() {
    let parts = vec![call("a", "A"), call("b", "B"), call("c", "C")];
    let event = ResolutionEvent::Batch(vec![ToolDecision::Accept {
        call_id: "a".into(),
        result: AcceptResult::Json(serde_json::json!({})),
    }]);
    let out = transition_suspended(parts, event);
    assert_eq!(ids(&out.state), vec!["b".to_string(), "c".to_string()]);
    assert!(!out.resume);
}

#[test]
fn accept_user_tool_placeholder_counts_as_resolved() {
    // A user tool's accept yields a PendingUserExecution placeholder, which is
    // still a tool response — the chain must leave Suspended.
    let parts = vec![call("u", "SendEmail")];
    let placeholder = serde_json::json!("PendingUserExecution");
    let event = ResolutionEvent::Batch(vec![ToolDecision::Accept {
        call_id: "u".into(),
        result: AcceptResult::Json(placeholder),
    }]);
    let out = transition_suspended(parts, event);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(out.resume);
}

#[test]
fn accept_with_err_result_still_resolves() {
    let parts = vec![call("a", "A")];
    let event = ResolutionEvent::Batch(vec![ToolDecision::Accept {
        call_id: "a".into(),
        result: AcceptResult::Err("boom".into()),
    }]);
    let out = transition_suspended(parts, event);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(out.resume);
    assert!(matches!(
        &out.parts[1],
        AssistantMessagePart::ToolCallErr { description, .. } if description == "boom"
    ));
}

// --- transition_suspended: deny ---

#[test]
fn deny_one_stays_suspended_on_remaining() {
    let parts = vec![call("a", "A"), call("b", "B")];
    let event = ResolutionEvent::Batch(vec![ToolDecision::Deny {
        call_id: "a".into(),
    }]);
    let out = transition_suspended(parts, event);
    assert_eq!(ids(&out.state), vec!["b".to_string()]);
    assert!(!out.resume);
    // "a" got a denied error response
    assert!(
        resolution_descriptions(&out.parts)
            .iter()
            .any(|(id, d)| id == "a" && d.as_deref() == Some("denied"))
    );
}

#[test]
fn deny_all_becomes_ready_and_resumes() {
    let parts = vec![call("a", "A"), call("b", "B")];
    let event = ResolutionEvent::Batch(vec![
        ToolDecision::Deny {
            call_id: "a".into(),
        },
        ToolDecision::Deny {
            call_id: "b".into(),
        },
    ]);
    let out = transition_suspended(parts, event);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(out.resume);
}

#[test]
fn mixed_accept_and_deny_covering_all_becomes_ready() {
    let parts = vec![call("a", "A"), call("b", "B")];
    let event = ResolutionEvent::Batch(vec![
        ToolDecision::Accept {
            call_id: "a".into(),
            result: AcceptResult::Json(serde_json::json!({})),
        },
        ToolDecision::Deny {
            call_id: "b".into(),
        },
    ]);
    let out = transition_suspended(parts, event);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(out.resume);
}

// --- transition_suspended: cancel ---

#[test]
fn cancel_resolves_all_pending_as_cancelled_ready_no_resume() {
    let parts = vec![call("a", "A"), call("b", "B"), call("c", "C")];
    let out = transition_suspended(parts, ResolutionEvent::Cancel);
    assert_eq!(out.state, MessageChainState::Ready);
    // cancel never resumes, even though Ready
    assert!(!out.resume);
    let descs = resolution_descriptions(&out.parts);
    for id in ["a", "b", "c"] {
        assert!(
            descs
                .iter()
                .any(|(i, d)| i == id && d.as_deref() == Some("cancelled"))
        );
    }
}

#[test]
fn cancel_preserves_already_resolved_calls() {
    // a is resolved, only b/c are pending; cancel touches only the pending.
    let parts = vec![
        call("a", "A"),
        response("a", "A"),
        call("b", "B"),
        call("c", "C"),
    ];
    let out = transition_suspended(parts, ResolutionEvent::Cancel);
    assert_eq!(out.state, MessageChainState::Ready);
    let descs = resolution_descriptions(&out.parts);
    // a keeps its real response (no cancelled), b/c become cancelled
    assert!(descs.iter().any(|(i, d)| i == "a" && d.is_none()));
    assert!(
        descs
            .iter()
            .any(|(i, d)| i == "b" && d.as_deref() == Some("cancelled"))
    );
}

// --- edge cases ---

#[test]
fn decision_for_unknown_call_is_noop() {
    let parts = vec![call("a", "A")];
    let event = ResolutionEvent::Batch(vec![ToolDecision::Deny {
        call_id: "does-not-exist".into(),
    }]);
    let out = transition_suspended(parts, event);
    // "a" still dangling
    assert_eq!(ids(&out.state), vec!["a".to_string()]);
    assert!(!out.resume);
}

#[test]
fn decision_for_already_resolved_call_is_noop() {
    let parts = vec![call("a", "A"), response("a", "A"), call("b", "B")];
    let event = ResolutionEvent::Batch(vec![ToolDecision::Deny {
        call_id: "a".into(),
    }]);
    let out = transition_suspended(parts, event);
    // only b dangling, a's decision ignored (no duplicate result)
    assert_eq!(ids(&out.state), vec!["b".to_string()]);
    assert_eq!(
        out.parts
            .iter()
            .filter(|p| matches!(
                p,
                AssistantMessagePart::ToolCallResponseJson { id, .. }
                    | AssistantMessagePart::ToolCallErr { id, .. } if id == "a"
            ))
            .count(),
        1
    );
}

#[test]
fn cancel_on_ready_chain_is_ready_no_resume() {
    let parts = vec![call("a", "A"), response("a", "A")];
    let out = transition_suspended(parts, ResolutionEvent::Cancel);
    assert_eq!(out.state, MessageChainState::Ready);
    assert!(!out.resume);
}
