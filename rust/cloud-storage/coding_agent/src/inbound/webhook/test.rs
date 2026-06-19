use super::*;

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::models::{
    AgentCorrelation, AgentMessage, AgentPrompt, CodingAgent, CodingAgentEvent, CodingAgentId,
    CodingAgentProviderKind, CodingAgentStatus, LaunchAgentRequest, ProviderCapabilities,
};

/// Provider stub: webhook verification succeeds or fails based on `body_ok` and
/// returns a canned event carrying correlation (as a real provider would after
/// recovering it from the payload).
struct FakeProvider {
    body_ok: bool,
}

#[async_trait]
impl CodingAgentProvider for FakeProvider {
    fn kind(&self) -> CodingAgentProviderKind {
        CodingAgentProviderKind::Claude
    }
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            follow_up: true,
            stop: false,
            delete: true,
            conversation: true,
            webhooks: true,
            requires_status_polling: false,
        }
    }
    async fn launch(&self, _r: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
    async fn get(&self, _id: &CodingAgentId) -> Result<CodingAgent, CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
    async fn conversation(
        &self,
        _id: &CodingAgentId,
    ) -> Result<Vec<AgentMessage>, CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
    async fn follow_up(
        &self,
        _id: &CodingAgentId,
        _p: AgentPrompt,
    ) -> Result<(), CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
    fn verify_and_parse_webhook(
        &self,
        _headers: &dyn WebhookHeaders,
        _raw_body: &[u8],
    ) -> Result<CodingAgentEvent, CodingAgentError> {
        if !self.body_ok {
            return Err(CodingAgentError::WebhookVerification(
                "bad signature".to_owned(),
            ));
        }
        Ok(CodingAgentEvent {
            provider: CodingAgentProviderKind::Claude,
            id: CodingAgentId("sess_1".to_owned()),
            status: CodingAgentStatus::Finished,
            summary: Some("done".to_owned()),
            pr_url: Some("https://github.com/x/y/pull/9".to_owned()),
            web_url: None,
            branch_name: None,
            correlation: Some(AgentCorrelation {
                user_id: "macro|alice@macro.com".to_owned(),
                chat_id: Some("chat-1".to_owned()),
            }),
            raw: serde_json::json!({}),
        })
    }
}

#[derive(Default)]
struct RecordingSink {
    delivered: Mutex<Vec<CodingAgentEvent>>,
}

#[async_trait]
impl CodingAgentEventSink for RecordingSink {
    async fn deliver(&self, event: CodingAgentEvent) -> Result<(), CodingAgentError> {
        self.delivered.lock().unwrap().push(event);
        Ok(())
    }
}

#[tokio::test]
async fn delivers_verified_event_with_correlation() {
    let provider = FakeProvider { body_ok: true };
    let sink = RecordingSink::default();
    let headers: HashMap<String, String> = HashMap::new();

    process_webhook(&provider, &sink, &headers, b"{}")
        .await
        .expect("should deliver");

    let delivered = sink.delivered.lock().unwrap();
    assert_eq!(delivered.len(), 1);
    assert_eq!(delivered[0].id, CodingAgentId("sess_1".to_owned()));
    let correlation = delivered[0].correlation.as_ref().expect("correlation");
    assert_eq!(correlation.user_id, "macro|alice@macro.com");
    assert_eq!(correlation.chat_id.as_deref(), Some("chat-1"));
}

#[tokio::test]
async fn rejects_bad_delivery_without_delivering() {
    let provider = FakeProvider { body_ok: false };
    let sink = RecordingSink::default();
    let headers: HashMap<String, String> = HashMap::new();

    let result = process_webhook(&provider, &sink, &headers, b"{}").await;
    assert!(result.is_err());
    assert!(sink.delivered.lock().unwrap().is_empty());
}
