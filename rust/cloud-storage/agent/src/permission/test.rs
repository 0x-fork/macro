use super::*;
use ai_toolset::ToolAnnotations;

#[test]
fn read_only_annotation_allows() {
    let ann = ToolAnnotations::new().read_only(true);
    assert_eq!(
        ToolPermission::from_annotations(&ann),
        ToolPermission::AlwaysAllow
    );
}

#[test]
fn destructive_annotation_needs_permission() {
    let ann = ToolAnnotations::new().destructive(true);
    assert_eq!(
        ToolPermission::from_annotations(&ann),
        ToolPermission::NeedsPermission
    );
}

#[test]
fn default_annotation_needs_permission() {
    let ann = ToolAnnotations::default();
    assert_eq!(
        ToolPermission::from_annotations(&ann),
        ToolPermission::NeedsPermission
    );
}

#[test]
fn read_only_false_needs_permission() {
    let ann = ToolAnnotations::new().read_only(false);
    assert_eq!(
        ToolPermission::from_annotations(&ann),
        ToolPermission::NeedsPermission
    );
}

#[test]
fn read_only_and_destructive_still_allows() {
    let ann = ToolAnnotations::new().read_only(true).destructive(true);
    assert_eq!(
        ToolPermission::from_annotations(&ann),
        ToolPermission::AlwaysAllow
    );
}

#[test]
fn denied_placeholder_carries_tool_call_id() {
    let call = PendingToolCall {
        tool_call_id: "id_1".to_string(),
        tool_name: "tool".to_string(),
        args: serde_json::json!({}),
    };
    let part = denied_placeholder_part(&call);
    match part {
        crate::types::AssistantMessagePart::ToolCallErr {
            id,
            name,
            description,
        } => {
            assert_eq!(id, "id_1");
            assert_eq!(name, "tool");
            assert_eq!(description, PERMISSION_DENIED_PLACEHOLDER);
        }
        other => panic!("expected ToolCallErr, got {other:?}"),
    }
}
