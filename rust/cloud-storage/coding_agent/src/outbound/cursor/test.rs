use super::*;

use std::collections::HashMap;

use crate::domain::models::{
    AgentCorrelation, AgentPrompt, AgentSource, AgentTarget, CodingAgentId, CodingAgentStatus,
    LaunchAgentRequest, WebhookConfig,
};
use crate::domain::ports::CodingAgentProvider;

const SECRET: &str = "0123456789012345678901234567890123";

fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
}

fn provider_with_webhook() -> CursorAgentProvider {
    CursorAgentProvider::new("test-key").with_webhook(WebhookConfig {
        url: "https://macro.example/webhooks/coding-agent/cursor".to_owned(),
        secret: SECRET.to_owned(),
    })
}

#[test]
fn status_mapping_is_normalized() {
    assert_eq!(map_status("CREATING"), CodingAgentStatus::Pending);
    assert_eq!(map_status("running"), CodingAgentStatus::Running);
    assert_eq!(map_status("FINISHED"), CodingAgentStatus::Finished);
    assert_eq!(map_status("ERROR"), CodingAgentStatus::Failed);
    assert_eq!(map_status("EXPIRED"), CodingAgentStatus::Expired);
    assert!(matches!(
        map_status("SOMETHING_NEW"),
        CodingAgentStatus::Unknown(raw) if raw == "SOMETHING_NEW"
    ));
    assert!(CodingAgentStatus::Finished.is_terminal());
    assert!(!CodingAgentStatus::Running.is_terminal());
    assert!(!CodingAgentStatus::AwaitingInput.is_terminal());
}

#[test]
fn launch_request_serializes_to_cursor_shape() {
    let request = LaunchAgentRequest {
        prompt: AgentPrompt::text("fix the flaky login test"),
        source: AgentSource {
            repository: "https://github.com/macro-inc/macro".to_owned(),
            git_ref: Some("main".to_owned()),
        },
        model: Some("claude-4-sonnet".to_owned()),
        target: AgentTarget {
            branch_name: Some("fix/login".to_owned()),
            auto_create_pr: true,
        },
        correlation: None,
        provider_options: Default::default(),
    };
    let webhook = CursorWebhook {
        url: "https://macro.example/webhooks/coding-agent/cursor/token".to_owned(),
        secret: Some(SECRET.to_owned()),
    };

    let body = CursorLaunchRequest::build(&request, Some(webhook));
    let json = serde_json::to_value(&body).unwrap();

    assert_eq!(json["prompt"]["text"], "fix the flaky login test");
    assert!(json["prompt"].get("images").is_none());
    assert_eq!(
        json["source"]["repository"],
        "https://github.com/macro-inc/macro"
    );
    assert_eq!(json["source"]["ref"], "main");
    assert_eq!(json["model"], "claude-4-sonnet");
    assert_eq!(json["target"]["branchName"], "fix/login");
    assert_eq!(json["target"]["autoCreatePr"], true);
    assert_eq!(
        json["webhook"]["url"],
        "https://macro.example/webhooks/coding-agent/cursor/token"
    );
    assert_eq!(json["webhook"]["secret"], SECRET);
}

#[test]
fn agent_response_maps_to_domain() {
    let raw = r#"{
        "id": "bc_abc123",
        "name": "Fix login",
        "status": "FINISHED",
        "source": { "repository": "https://github.com/macro-inc/macro", "ref": "main" },
        "target": {
            "branchName": "fix/login",
            "prUrl": "https://github.com/macro-inc/macro/pull/42",
            "url": "https://cursor.com/agents/bc_abc123"
        },
        "summary": "All tests pass.",
        "createdAt": "2026-06-19T12:00:00Z"
    }"#;

    let agent: CursorAgent = serde_json::from_str(raw).unwrap();
    let domain = agent.into_domain();

    assert_eq!(domain.id, CodingAgentId("bc_abc123".to_owned()));
    assert_eq!(domain.provider, CodingAgentProviderKind::Cursor);
    assert_eq!(domain.status, CodingAgentStatus::Finished);
    assert_eq!(domain.name.as_deref(), Some("Fix login"));
    assert_eq!(domain.branch_name.as_deref(), Some("fix/login"));
    assert_eq!(
        domain.pr_url.as_deref(),
        Some("https://github.com/macro-inc/macro/pull/42")
    );
    assert_eq!(
        domain.web_url.as_deref(),
        Some("https://cursor.com/agents/bc_abc123")
    );
    assert!(domain.created_at.is_some());
}

#[test]
fn signature_verification_accepts_valid_and_rejects_tampered() {
    let secret = "supersecret-supersecret-supersecret";
    let body = br#"{"event":"statusChange","id":"bc_1","status":"FINISHED"}"#;
    let signature = sign(secret, body);

    assert!(verify_signature(secret, body, &signature).is_ok());

    let tampered = br#"{"event":"statusChange","id":"bc_1","status":"ERROR"}"#;
    assert!(verify_signature(secret, tampered, &signature).is_err());
    assert!(verify_signature("not-the-secret", body, &signature).is_err());
    assert!(verify_signature(secret, body, "sha256=deadbeef").is_err());
}

#[test]
fn verify_and_parse_webhook_recovers_correlation() {
    let provider = provider_with_webhook();
    let body = br#"{
        "event": "statusChange",
        "id": "bc_xyz",
        "status": "FINISHED",
        "summary": "Opened a PR.",
        "target": { "prUrl": "https://github.com/macro-inc/macro/pull/7", "branchName": "fix/x" }
    }"#;

    let url_token = sign_route_token(
        SECRET,
        &AgentCorrelation {
            user_id: "macro|teo@macro.com".to_owned(),
            chat_id: Some("chat-9".to_owned()),
        },
    );

    let mut headers = HashMap::new();
    headers.insert("x-webhook-signature".to_owned(), sign(SECRET, body));

    let event = provider
        .verify_and_parse_webhook(&headers, body, Some(&url_token))
        .expect("valid webhook should verify");

    assert_eq!(event.id, CodingAgentId("bc_xyz".to_owned()));
    assert_eq!(event.status, CodingAgentStatus::Finished);
    assert_eq!(event.summary.as_deref(), Some("Opened a PR."));
    assert_eq!(
        event.pr_url.as_deref(),
        Some("https://github.com/macro-inc/macro/pull/7")
    );
    assert_eq!(event.branch_name.as_deref(), Some("fix/x"));
    let correlation = event.correlation.expect("correlation recovered from token");
    assert_eq!(correlation.user_id, "macro|teo@macro.com");
    assert_eq!(correlation.chat_id.as_deref(), Some("chat-9"));
}

#[test]
fn verify_and_parse_webhook_rejects_missing_signature() {
    let provider = provider_with_webhook();
    let headers: HashMap<String, String> = HashMap::new();
    let result = provider.verify_and_parse_webhook(&headers, b"{}", None);
    assert!(matches!(
        result,
        Err(CodingAgentError::WebhookVerification(_))
    ));
}

#[test]
fn verify_and_parse_webhook_requires_configured_webhook() {
    let provider = CursorAgentProvider::new("test-key");
    let headers: HashMap<String, String> = HashMap::new();
    let result = provider.verify_and_parse_webhook(&headers, b"{}", None);
    assert!(matches!(
        result,
        Err(CodingAgentError::WebhookVerification(_))
    ));
}

#[test]
fn capabilities_reflect_webhook_configuration() {
    assert!(!CursorAgentProvider::new("k").capabilities().webhooks);
    assert!(provider_with_webhook().capabilities().webhooks);
    assert!(provider_with_webhook().capabilities().follow_up);
    assert!(
        provider_with_webhook()
            .capabilities()
            .requires_status_polling
    );
}
