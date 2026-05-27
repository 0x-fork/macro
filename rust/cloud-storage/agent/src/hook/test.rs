use super::*;
use crate::stream::StreamPart;
use ai_toolset::ToolAnnotations;
use rig_core::agent::{PromptHook, ToolCallHookAction};
use rig_core::providers::anthropic::completion::CompletionModel as AnthropicModel;

fn no_routing() -> ToolRouter {
    Arc::new(|_| None)
}

fn make_bridge(
    annotations_fn: AnnotationsFn,
) -> (
    StreamBridge,
    mpsc::UnboundedReceiver<Result<StreamPart, AgentError>>,
) {
    StreamBridge::new(annotations_fn, no_routing())
}

async fn call_tool(
    bridge: &StreamBridge,
    tool_name: &str,
    tool_call_id: Option<String>,
    args: &str,
) -> ToolCallHookAction {
    <StreamBridge as PromptHook<AnthropicModel>>::on_tool_call(
        bridge,
        tool_name,
        tool_call_id,
        "internal",
        args,
    )
    .await
}

fn read_only_annotations() -> AnnotationsFn {
    Arc::new(|_| ToolAnnotations::new().read_only(true).destructive(false))
}

fn destructive_annotations() -> AnnotationsFn {
    Arc::new(|_| ToolAnnotations::new().read_only(false).destructive(true))
}

fn mixed_annotations() -> AnnotationsFn {
    Arc::new(|name: &str| match name {
        "safe_tool" => ToolAnnotations::new().read_only(true),
        _ => ToolAnnotations::new().destructive(true),
    })
}

#[tokio::test]
async fn allowed_tool_emits_tool_call_and_continues() {
    let (bridge, mut rx) = make_bridge(read_only_annotations());

    let action = call_tool(&bridge, "my_tool", Some("id_1".into()), r#"{"x":1}"#).await;

    assert_eq!(action, ToolCallHookAction::Continue);

    let event = rx.try_recv().unwrap().unwrap();
    match event {
        StreamPart::ToolCall(tc) => {
            assert_eq!(tc.id, "id_1");
            assert_eq!(tc.name, "my_tool");
            assert_eq!(tc.json, serde_json::json!({"x": 1}));
        }
        other => panic!("expected ToolCall, got {other:?}"),
    }
}

#[tokio::test]
async fn needs_permission_emits_request_and_terminates() {
    let (bridge, mut rx) = make_bridge(destructive_annotations());

    let action = call_tool(&bridge, "danger_tool", Some("id_2".into()), r#"{}"#).await;

    assert!(matches!(action, ToolCallHookAction::Terminate { .. }));

    let event = rx.try_recv().unwrap().unwrap();
    match event {
        StreamPart::PermissionRequest(pr) => {
            assert_eq!(pr.tool_call_id, "id_2");
            assert_eq!(pr.tool_name, "danger_tool");
        }
        other => panic!("expected PermissionRequest, got {other:?}"),
    }

    assert!(rx.try_recv().is_err());
}

#[tokio::test]
async fn needs_permission_sets_pending() {
    let (bridge, _rx) = make_bridge(destructive_annotations());

    call_tool(&bridge, "danger_tool", Some("id_2".into()), r#"{"a":1}"#).await;

    let pending = bridge.pending.lock().unwrap().take();
    let pending = pending.expect("pending should be set");
    assert_eq!(pending.tool_call_id, "id_2");
    assert_eq!(pending.tool_name, "danger_tool");
    assert_eq!(pending.args, serde_json::json!({"a": 1}));
}

#[tokio::test]
async fn default_annotations_need_permission() {
    let (bridge, mut rx) = make_bridge(Arc::new(|_| ToolAnnotations::default()));

    let action = call_tool(&bridge, "unknown_tool", Some("id_3".into()), r#"{}"#).await;

    assert!(matches!(action, ToolCallHookAction::Terminate { .. }));

    let event = rx.try_recv().unwrap().unwrap();
    assert!(matches!(event, StreamPart::PermissionRequest(_)));
}

#[tokio::test]
async fn mixed_annotations_route_correctly() {
    let (bridge, mut rx) = make_bridge(mixed_annotations());

    let action_safe = call_tool(&bridge, "safe_tool", Some("s1".into()), r#"{}"#).await;
    assert_eq!(action_safe, ToolCallHookAction::Continue);

    let event = rx.try_recv().unwrap().unwrap();
    assert!(matches!(event, StreamPart::ToolCall(_)));

    let action_danger = call_tool(&bridge, "danger_tool", Some("d1".into()), r#"{}"#).await;
    assert!(matches!(
        action_danger,
        ToolCallHookAction::Terminate { .. }
    ));

    let event = rx.try_recv().unwrap().unwrap();
    assert!(matches!(event, StreamPart::PermissionRequest(_)));
}

#[tokio::test]
async fn falls_back_to_internal_call_id_when_no_tool_call_id() {
    let (bridge, mut rx) = make_bridge(read_only_annotations());

    let action = <StreamBridge as PromptHook<AnthropicModel>>::on_tool_call(
        &bridge,
        "my_tool",
        None,
        "fallback_id",
        r#"{}"#,
    )
    .await;
    assert_eq!(action, ToolCallHookAction::Continue);

    let event = rx.try_recv().unwrap().unwrap();
    match event {
        StreamPart::ToolCall(tc) => assert_eq!(tc.id, "fallback_id"),
        other => panic!("expected ToolCall, got {other:?}"),
    }
}

#[tokio::test]
async fn channel_helper_allows_all() {
    let (bridge, mut rx) = StreamBridge::channel();

    let action = call_tool(&bridge, "anything", Some("id".into()), r#"{}"#).await;
    assert_eq!(action, ToolCallHookAction::Continue);

    let event = rx.try_recv().unwrap().unwrap();
    assert!(matches!(event, StreamPart::ToolCall(_)));
}
