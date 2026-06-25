use super::*;
use rig_core::providers::anthropic::completion::CompletionModel as AnthropicModel;
use schemars::Schema;
use std::sync::Mutex;

fn searchable(name: &str) -> SearchableTool {
    SearchableTool {
        name: name.to_string(),
        description: "desc".to_string(),
        schema: Schema::default(),
    }
}

/// A register fn that records the names it was handed.
fn recording_register() -> (RegisterFn, Arc<Mutex<Vec<String>>>) {
    let recorded = Arc::new(Mutex::new(Vec::<String>::new()));
    let sink = recorded.clone();
    let register: RegisterFn = Arc::new(move |tools: Vec<SearchableTool>| {
        let sink = sink.clone();
        Box::pin(async move {
            sink.lock()
                .unwrap()
                .extend(tools.into_iter().map(|t| t.name));
        }) as Pin<Box<dyn Future<Output = ()> + Send>>
    });
    (register, recorded)
}

/// A permission gate that always allows.
fn allow_all() -> PermissionGate {
    Arc::new(|_| Permission::AlwaysAllow)
}

#[tokio::test]
async fn on_tool_result_drains_buffer_and_registers_loaded_tools() {
    let buffer = Arc::new(Mutex::new(vec![
        searchable("mcp__slack__send"),
        searchable("mcp__linear__create_issue"),
    ]));
    let (register, registered) = recording_register();
    let routing: ToolRouter = Arc::new(|_| None);
    let (bridge, _rx) = StreamBridge::channel(routing, allow_all(), buffer.clone(), register);

    let action = <StreamBridge as PromptHook<AnthropicModel>>::on_tool_result(
        &bridge,
        "SearchTools",
        None,
        "call-1",
        "{}",
        "{\"loaded\":[]}",
    )
    .await;

    assert!(matches!(action, HookAction::Continue));
    // Buffer drained and both pending tools handed to the registrar.
    assert!(buffer.lock().unwrap().is_empty());
    let mut got = registered.lock().unwrap().clone();
    got.sort();
    assert_eq!(
        got,
        vec![
            "mcp__linear__create_issue".to_string(),
            "mcp__slack__send".to_string()
        ]
    );
}

#[tokio::test]
async fn on_tool_result_registers_nothing_when_buffer_empty() {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let (register, registered) = recording_register();
    let routing: ToolRouter = Arc::new(|_| None);
    let (bridge, _rx) = StreamBridge::channel(routing, allow_all(), buffer, register);

    let _ = <StreamBridge as PromptHook<AnthropicModel>>::on_tool_result(
        &bridge,
        "WebSearch",
        None,
        "call-2",
        "{}",
        "{}",
    )
    .await;

    assert!(registered.lock().unwrap().is_empty());
}

#[tokio::test]
async fn on_tool_call_terminates_when_gated_and_streams_the_call() {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let (register, _registered) = recording_register();
    let routing: ToolRouter = Arc::new(|_| None);
    // Gate that requires permission for the destructive tool.
    let gate: PermissionGate = Arc::new(|name: &str| {
        if name == "DeleteThing" {
            Permission::NeedsPermission
        } else {
            Permission::AlwaysAllow
        }
    });
    let (bridge, mut rx) = StreamBridge::channel(routing, gate, buffer, register);

    let action = <StreamBridge as PromptHook<AnthropicModel>>::on_tool_call(
        &bridge,
        "DeleteThing",
        Some("call-9".into()),
        "call-9",
        "{}",
    )
    .await;

    // Loop terminates with the permission reason → call left dangling.
    assert!(matches!(
        action,
        ToolCallHookAction::Terminate { ref reason } if reason == PERMISSION_SUSPEND_REASON
    ));
    // The tool call was still streamed (so the unresolved call renders in place).
    let part = rx.try_recv().expect("tool call streamed");
    assert!(matches!(part, Ok(StreamPart::ToolCall(ref c)) if c.id == "call-9"));
}

#[tokio::test]
async fn on_tool_call_continues_when_allowed() {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let (register, _registered) = recording_register();
    let routing: ToolRouter = Arc::new(|_| None);
    let (bridge, mut rx) = StreamBridge::channel(routing, allow_all(), buffer, register);

    let action = <StreamBridge as PromptHook<AnthropicModel>>::on_tool_call(
        &bridge,
        "ReadThing",
        Some("call-1".into()),
        "call-1",
        "{}",
    )
    .await;

    assert!(matches!(action, ToolCallHookAction::Continue));
    let part = rx.try_recv().expect("tool call streamed");
    assert!(matches!(part, Ok(StreamPart::ToolCall(ref c)) if c.id == "call-1"));
}
