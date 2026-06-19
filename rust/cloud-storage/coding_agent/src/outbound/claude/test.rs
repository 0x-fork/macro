use super::*;

use std::collections::HashMap;

use crate::domain::models::{AgentPrompt, AgentSource, AgentTarget};

const SECRET: &str = "0123456789012345678901234567890123";

fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
}

fn launch_request() -> LaunchAgentRequest {
    LaunchAgentRequest {
        prompt: AgentPrompt::text("add a test"),
        source: AgentSource {
            repository: "https://github.com/macro-inc/macro".to_owned(),
            git_ref: Some("main".to_owned()),
        },
        model: None,
        target: AgentTarget {
            branch_name: None,
            auto_create_pr: true,
        },
        git_token: Some("ghp_abc".to_owned()),
        correlation: Some(AgentCorrelation {
            user_id: "macro|teo@macro.com".to_owned(),
            chat_id: Some("chat-1".to_owned()),
        }),
        provider_options: Default::default(),
    }
}

#[test]
fn status_mapping_is_normalized() {
    assert_eq!(map_status("status_run_started"), CodingAgentStatus::Running);
    assert_eq!(map_status("status_idled"), CodingAgentStatus::AwaitingInput);
    assert_eq!(map_status("idle"), CodingAgentStatus::AwaitingInput);
    assert_eq!(map_status("status_terminated"), CodingAgentStatus::Failed);
    assert_eq!(map_status("completed"), CodingAgentStatus::Finished);
    assert!(matches!(map_status("weird"), CodingAgentStatus::Unknown(_)));
}

#[test]
fn resolves_agent_and_environment() {
    let provider = ClaudeAgentProvider::new("key").with_agent("agent_default", "env_default");
    let request = launch_request();
    assert_eq!(
        provider.resolve_agent_id(&request).unwrap(),
        "agent_default"
    );
    assert_eq!(
        provider.resolve_environment_id(&request).unwrap(),
        "env_default"
    );

    // provider_options override the defaults.
    let mut overridden = launch_request();
    overridden
        .provider_options
        .insert("agent_id".to_owned(), serde_json::json!("agent_override"));
    overridden.provider_options.insert(
        "environment_id".to_owned(),
        serde_json::json!("env_override"),
    );
    assert_eq!(
        provider.resolve_agent_id(&overridden).unwrap(),
        "agent_override"
    );
    assert_eq!(
        provider.resolve_environment_id(&overridden).unwrap(),
        "env_override"
    );

    // Missing config is a clear error.
    let bare = ClaudeAgentProvider::new("key");
    assert!(matches!(
        bare.resolve_agent_id(&launch_request()),
        Err(CodingAgentError::InvalidRequest(_))
    ));
}

#[test]
fn create_session_body_mounts_repo_with_token_and_metadata() {
    let request = launch_request();
    // Claude requires string-valued metadata, so the correlation is encoded as
    // a JSON string (matching `launch`).
    let metadata = request.correlation.as_ref().map(|c| {
        serde_json::json!({ CORRELATION_METADATA_KEY: serde_json::to_string(c).unwrap() })
    });
    let body = ClaudeCreateSessionRequest {
        agent: "agent_1".to_owned(),
        environment_id: "env_1".to_owned(),
        resources: vec![ClaudeResource {
            kind: "github_repository",
            url: request.source.repository.clone(),
            mount_path: REPO_MOUNT_PATH.to_owned(),
            authorization_token: request.git_token.clone(),
        }],
        metadata,
    };
    let json = serde_json::to_value(&body).unwrap();

    assert_eq!(json["agent"], "agent_1");
    assert_eq!(json["environment_id"], "env_1");
    assert_eq!(json["resources"][0]["type"], "github_repository");
    assert_eq!(
        json["resources"][0]["url"],
        "https://github.com/macro-inc/macro"
    );
    assert_eq!(json["resources"][0]["mount_path"], "/workspace/repo");
    assert_eq!(json["resources"][0]["authorization_token"], "ghp_abc");
    // The metadata value must be a string (not a nested object), then decode
    // back to the original correlation.
    let encoded = json["metadata"][CORRELATION_METADATA_KEY]
        .as_str()
        .expect("correlation metadata must be a string");
    let decoded: AgentCorrelation = serde_json::from_str(encoded).unwrap();
    assert_eq!(decoded.user_id, "macro|teo@macro.com");
    assert_eq!(decoded.chat_id.as_deref(), Some("chat-1"));
}

#[test]
fn user_message_event_uses_content_blocks() {
    let body = ClaudeSendEvents {
        events: vec![ClaudeUserMessage::text("do the thing")],
    };
    let json = serde_json::to_value(&body).unwrap();
    assert_eq!(json["events"][0]["type"], "user.message");
    assert_eq!(json["events"][0]["content"][0]["type"], "text");
    assert_eq!(json["events"][0]["content"][0]["text"], "do the thing");
}

#[test]
fn task_prompt_references_mount_path() {
    let prompt = build_task_prompt(&launch_request());
    assert!(prompt.contains("/workspace/repo"));
    assert!(prompt.contains("pull request"));
}

#[test]
fn verify_and_parse_webhook_recovers_correlation_from_metadata() {
    let provider = ClaudeAgentProvider::new("key").with_webhook_secret(SECRET);
    // Claude echoes metadata values back as strings (the form `launch` sends).
    let body = serde_json::to_vec(&serde_json::json!({
        "type": "session.status_idled",
        "session": {
            "id": "sess_123",
            "status": "idled",
            "metadata": { CORRELATION_METADATA_KEY: r#"{"u":"macro|teo@macro.com","c":"chat-7"}"# }
        }
    }))
    .unwrap();

    let mut headers = HashMap::new();
    headers.insert("x-webhook-signature".to_owned(), sign(SECRET, &body));

    let event = provider
        .verify_and_parse_webhook(&headers, &body)
        .expect("valid webhook should verify");

    assert_eq!(event.id, CodingAgentId("sess_123".to_owned()));
    assert_eq!(event.status, CodingAgentStatus::AwaitingInput);
    let correlation = event.correlation.expect("correlation from metadata");
    assert_eq!(correlation.user_id, "macro|teo@macro.com");
    assert_eq!(correlation.chat_id.as_deref(), Some("chat-7"));
}

#[test]
fn verify_and_parse_webhook_rejects_bad_signature() {
    let provider = ClaudeAgentProvider::new("key").with_webhook_secret(SECRET);
    let body = br#"{"type":"session.status_idled","session":{"id":"s","status":"idled"}}"#;
    let mut headers = HashMap::new();
    headers.insert("x-webhook-signature".to_owned(), sign("wrong-secret", body));
    assert!(matches!(
        provider.verify_and_parse_webhook(&headers, body),
        Err(CodingAgentError::WebhookVerification(_))
    ));
}

#[test]
fn capabilities_reflect_webhook_secret() {
    assert!(!ClaudeAgentProvider::new("k").capabilities().webhooks);
    assert!(
        ClaudeAgentProvider::new("k")
            .with_webhook_secret(SECRET)
            .capabilities()
            .webhooks
    );
    let caps = ClaudeAgentProvider::new("k").capabilities();
    assert!(caps.follow_up);
    assert!(!caps.stop);
    assert!(!caps.requires_status_polling);
}
