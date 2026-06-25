use super::*;

#[test]
fn resolve_request_deserializes_batch() {
    let req: ResolveChatRequest = serde_json::from_value(serde_json::json!({
        "chat_id": "c1",
        "model": "anthropic/claude",
        "action": "resolve",
        "decisions": [
            { "kind": "accept", "call_id": "a" },
            { "kind": "deny", "call_id": "b" }
        ]
    }))
    .unwrap();

    assert_eq!(req.chat_id, "c1");
    match req.action {
        ResolveAction::Resolve { decisions } => {
            assert_eq!(decisions.len(), 2);
            assert!(matches!(&decisions[0], ToolResolution::Accept { call_id } if call_id == "a"));
            assert!(matches!(&decisions[1], ToolResolution::Deny { call_id } if call_id == "b"));
        }
        ResolveAction::Cancel => panic!("expected resolve"),
    }
}

#[test]
fn resolve_request_deserializes_cancel() {
    let req: ResolveChatRequest = serde_json::from_value(serde_json::json!({
        "chat_id": "c1",
        "model": "anthropic/claude",
        "action": "cancel"
    }))
    .unwrap();
    assert!(matches!(req.action, ResolveAction::Cancel));
}

fn assistant_parts(parts: Vec<AssistantMessagePart>) -> model::chat::ChatMessageWithAttachments {
    model::chat::ChatMessageWithAttachments {
        id: "m-suspended".into(),
        content: ChatMessageContent::AssistantMessageParts(parts),
        role: Role::Assistant,
        attachments: vec![],
    }
}

fn user_msg(id: &str, text: &str) -> model::chat::ChatMessageWithAttachments {
    model::chat::ChatMessageWithAttachments {
        id: id.into(),
        content: ChatMessageContent::Text(text.into()),
        role: Role::User,
        attachments: vec![],
    }
}

#[test]
fn rebuild_chain_substitutes_resolved_parts_for_suspended_message() {
    let call = AssistantMessagePart::ToolCall {
        name: "T".into(),
        json: serde_json::json!({}),
        id: "x".into(),
    };
    let resolved = vec![
        call.clone(),
        AssistantMessagePart::ToolCallResponseJson {
            name: "T".into(),
            json: serde_json::json!({ "ok": true }),
            id: "x".into(),
        },
    ];

    let chat = crate::model::chats::ChatResponse {
        id: "c1".into(),
        user_id: "u".into(),
        project_id: None,
        name: "n".into(),
        messages: vec![user_msg("m-user", "hello"), assistant_parts(vec![call])],
        model: None,
        created_at: None,
        updated_at: None,
        #[allow(deprecated)]
        attachments: vec![],
        token_count: None,
        web_citations: vec![],
        is_persistent: true,
    };

    let chain = rebuild_chain(&chat, "m-suspended", resolved.clone());
    assert_eq!(chain.len(), 2);
    // user message preserved
    assert_eq!(chain[0].role, Role::User);
    // suspended assistant message now carries the resolved parts
    match &chain[1].content {
        ChatMessageContent::AssistantMessageParts(parts) => {
            assert_eq!(parts.len(), 2);
            assert!(matches!(
                &parts[1],
                AssistantMessagePart::ToolCallResponseJson { id, .. } if id == "x"
            ));
        }
        _ => panic!("expected assistant parts"),
    }
}
