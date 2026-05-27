use super::*;
use ai_toolset::{RequestContext, ToolCallError, ToolResult, ToolSet as AiToolSet, ToolSetError};
use macro_user_id::user_id::MacroUserIdStr;
use std::future::Future;
use std::pin::Pin;

/// Minimal toolset for exercising resume resolution: returns a fixed outcome
/// for any tool call, and reports no MCP routing.
#[derive(Clone)]
struct FakeToolSet {
    outcome: Outcome,
}

#[derive(Clone)]
enum Outcome {
    Ok(serde_json::Value),
    ToolErr(String),
}

impl AiToolSet<()> for FakeToolSet {
    fn try_tool_call<'a>(
        &'a self,
        _context: (),
        _request_context: RequestContext,
        _tool_name: &'a str,
        _json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    > {
        let outcome = self.outcome.clone();
        Box::pin(async move {
            Ok(match outcome {
                Outcome::Ok(v) => Ok(v),
                Outcome::ToolErr(d) => Err(ToolCallError {
                    internal_error: anyhow::anyhow!("boom"),
                    description: d,
                }),
            })
        })
    }

    fn request_schemas(&self) -> Option<Vec<ai_toolset::RequestSchema>> {
        None
    }
}

fn req_ctx() -> RequestContext {
    RequestContext {
        user_id: MacroUserIdStr::try_from("macro|test@example.com".to_string()).unwrap(),
    }
}

fn pending(id: &str) -> AssistantMessagePart {
    AssistantMessagePart::PermissionRequest {
        name: "SendEmail".to_string(),
        json: serde_json::json!({"to": "a@b.com"}),
        id: id.to_string(),
    }
}

#[test]
fn detects_pending_permission() {
    assert!(has_pending_permission(&[pending("c1")]));
    assert!(!has_pending_permission(&[AssistantMessagePart::Text {
        text: "hi".to_string()
    }]));
}

#[tokio::test]
async fn granted_call_is_executed_and_paired_with_result() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(FakeToolSet {
        outcome: Outcome::Ok(serde_json::json!({"sent": true})),
    });
    let decisions = vec![ToolGrantDecision {
        tool_call_id: "c1".to_string(),
        approved: true,
    }];

    let resolved =
        resolve_permission_grants(vec![pending("c1")], &decisions, &toolset, &(), &req_ctx()).await;

    assert_eq!(resolved.len(), 2);
    match &resolved[0] {
        AssistantMessagePart::ToolCall { id, name, .. } => {
            assert_eq!(id, "c1");
            assert_eq!(name, "SendEmail");
        }
        other => panic!("expected ToolCall, got {other:?}"),
    }
    match &resolved[1] {
        AssistantMessagePart::ToolCallResponseJson { id, json, .. } => {
            assert_eq!(id, "c1");
            assert_eq!(json, &serde_json::json!({"sent": true}));
        }
        other => panic!("expected ToolCallResponseJson, got {other:?}"),
    }
}

#[tokio::test]
async fn denied_call_gets_placeholder_result() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(FakeToolSet {
        outcome: Outcome::Ok(serde_json::json!({"sent": true})),
    });
    let decisions = vec![ToolGrantDecision {
        tool_call_id: "c1".to_string(),
        approved: false,
    }];

    let resolved =
        resolve_permission_grants(vec![pending("c1")], &decisions, &toolset, &(), &req_ctx()).await;

    assert_eq!(resolved.len(), 2);
    match &resolved[1] {
        AssistantMessagePart::ToolCallErr {
            id, description, ..
        } => {
            assert_eq!(id, "c1");
            assert_eq!(description, agent::PERMISSION_DENIED_PLACEHOLDER);
        }
        other => panic!("expected ToolCallErr placeholder, got {other:?}"),
    }
}

#[tokio::test]
async fn ignored_call_with_no_decision_gets_placeholder() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(FakeToolSet {
        outcome: Outcome::Ok(serde_json::json!({"sent": true})),
    });

    // No decision provided for the pending call: treated as denied.
    let resolved =
        resolve_permission_grants(vec![pending("c1")], &[], &toolset, &(), &req_ctx()).await;

    assert_eq!(resolved.len(), 2);
    match &resolved[1] {
        AssistantMessagePart::ToolCallErr {
            id, description, ..
        } => {
            assert_eq!(id, "c1");
            assert_eq!(description, agent::PERMISSION_DENIED_PLACEHOLDER);
        }
        other => panic!("expected ToolCallErr placeholder, got {other:?}"),
    }
}

#[tokio::test]
async fn tool_execution_error_becomes_tool_call_err() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(FakeToolSet {
        outcome: Outcome::ToolErr("rate limited".to_string()),
    });
    let decisions = vec![ToolGrantDecision {
        tool_call_id: "c1".to_string(),
        approved: true,
    }];

    let resolved =
        resolve_permission_grants(vec![pending("c1")], &decisions, &toolset, &(), &req_ctx()).await;

    match &resolved[1] {
        AssistantMessagePart::ToolCallErr {
            id, description, ..
        } => {
            assert_eq!(id, "c1");
            assert_eq!(description, "rate limited");
        }
        other => panic!("expected ToolCallErr, got {other:?}"),
    }
}

#[tokio::test]
async fn non_permission_parts_are_preserved() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(FakeToolSet {
        outcome: Outcome::Ok(serde_json::json!({})),
    });
    let parts = vec![
        AssistantMessagePart::Text {
            text: "let me".to_string(),
        },
        pending("c1"),
    ];
    let decisions = vec![ToolGrantDecision {
        tool_call_id: "c1".to_string(),
        approved: false,
    }];

    let resolved = resolve_permission_grants(parts, &decisions, &toolset, &(), &req_ctx()).await;
    assert_eq!(resolved.len(), 3);
    assert!(matches!(resolved[0], AssistantMessagePart::Text { .. }));
    assert!(matches!(resolved[1], AssistantMessagePart::ToolCall { .. }));
    assert!(matches!(
        resolved[2],
        AssistantMessagePart::ToolCallErr { .. }
    ));
}
