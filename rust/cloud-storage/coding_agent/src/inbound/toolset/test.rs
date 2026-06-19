use super::*;

use ai_toolset::AsyncTool;
use async_trait::async_trait;
use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::models::{
    CodingAgentEvent, CodingAgentProviderKind, CodingAgentStatus, ProviderCapabilities,
};
use crate::domain::ports::WebhookHeaders;

/// A provider stub that records launches and returns canned snapshots.
struct FakeProvider;

#[async_trait]
impl CodingAgentProvider for FakeProvider {
    fn kind(&self) -> CodingAgentProviderKind {
        CodingAgentProviderKind::Cursor
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            follow_up: true,
            stop: true,
            delete: true,
            conversation: true,
            webhooks: true,
            requires_status_polling: true,
        }
    }

    async fn launch(&self, request: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError> {
        Ok(CodingAgent {
            id: CodingAgentId("bc_test".to_owned()),
            provider: CodingAgentProviderKind::Cursor,
            status: CodingAgentStatus::Pending,
            name: Some("test agent".to_owned()),
            source: Some(request.source),
            branch_name: request.target.branch_name,
            pr_url: None,
            web_url: None,
            summary: None,
            created_at: None,
        })
    }

    async fn get(&self, id: &CodingAgentId) -> Result<CodingAgent, CodingAgentError> {
        Ok(CodingAgent {
            id: id.clone(),
            provider: CodingAgentProviderKind::Cursor,
            status: CodingAgentStatus::Finished,
            name: None,
            source: None,
            branch_name: None,
            pr_url: Some("https://github.com/x/y/pull/1".to_owned()),
            web_url: None,
            summary: Some("done".to_owned()),
            created_at: None,
        })
    }

    fn verify_and_parse_webhook(
        &self,
        _headers: &dyn WebhookHeaders,
        _raw_body: &[u8],
        _secret: &str,
    ) -> Result<CodingAgentEvent, CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
}

fn request_context() -> RequestContext {
    RequestContext {
        user_id: MacroUserIdStr::try_from_email("test@macro.com").unwrap(),
    }
}

#[test]
fn toolset_registers_all_tools() {
    let toolset = coding_agent_toolset();
    for name in [
        "SpawnCodingAgent",
        "GetCodingAgentStatus",
        "FollowUpCodingAgent",
        "StopCodingAgent",
    ] {
        assert!(toolset.tools.contains_key(name), "missing tool {name}");
    }
}

#[tokio::test]
async fn spawn_tool_launches_via_provider() {
    let context = CodingAgentToolContext::new(Arc::new(FakeProvider));
    let tool = SpawnCodingAgent {
        task: "fix the bug".to_owned(),
        repository: "https://github.com/x/y".to_owned(),
        base_ref: None,
        branch_name: Some("fix/bug".to_owned()),
        model: None,
        auto_create_pr: None,
    };

    let response = tool
        .call(ServiceContext(context), request_context())
        .await
        .unwrap();

    assert_eq!(response.agent.id, "bc_test");
    assert_eq!(response.agent.provider, "cursor");
    assert_eq!(response.agent.status, "pending");
    assert_eq!(response.agent.branch_name.as_deref(), Some("fix/bug"));
    assert!(!response.agent.is_terminal);
    // No webhook configured on the context.
    assert!(!response.watching);
}

#[tokio::test]
async fn spawn_tool_marks_watching_when_webhook_configured() {
    let context = CodingAgentToolContext::with_webhook(
        Arc::new(FakeProvider),
        WebhookSettings {
            url: Arc::from("https://macro.example/hook"),
            secret: Arc::from("0123456789012345678901234567890123"),
        },
    );
    let tool = SpawnCodingAgent {
        task: "fix the bug".to_owned(),
        repository: "https://github.com/x/y".to_owned(),
        base_ref: None,
        branch_name: None,
        model: None,
        auto_create_pr: Some(false),
    };

    let response = tool
        .call(ServiceContext(context), request_context())
        .await
        .unwrap();
    assert!(response.watching);
}

#[tokio::test]
async fn status_tool_reads_provider() {
    let context = CodingAgentToolContext::new(Arc::new(FakeProvider));
    let tool = GetCodingAgentStatus {
        agent_id: "bc_test".to_owned(),
    };

    let view = tool
        .call(ServiceContext(context), request_context())
        .await
        .unwrap();

    assert_eq!(view.status, "finished");
    assert!(view.is_terminal);
    assert_eq!(
        view.pr_url.as_deref(),
        Some("https://github.com/x/y/pull/1")
    );
}
