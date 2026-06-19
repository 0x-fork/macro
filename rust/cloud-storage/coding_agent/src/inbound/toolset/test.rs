use super::*;

use ai_toolset::AsyncTool;
use async_trait::async_trait;
use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::models::{
    CodingAgent, CodingAgentEvent, CodingAgentProviderKind, CodingAgentStatus, LaunchAgentRequest,
    ProviderCapabilities,
};
use crate::domain::ports::WebhookHeaders;

/// A provider stub with a configurable `webhooks` capability that records the
/// launch request it received.
struct FakeProvider {
    webhooks: bool,
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
            webhooks: self.webhooks,
            requires_status_polling: false,
        }
    }

    async fn launch(&self, request: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError> {
        assert!(request.correlation.is_some(), "expected correlation");
        Ok(CodingAgent {
            id: CodingAgentId("sess_test".to_owned()),
            provider: CodingAgentProviderKind::Claude,
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
            provider: CodingAgentProviderKind::Claude,
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
    ) -> Result<CodingAgentEvent, CodingAgentError> {
        Err(CodingAgentError::Unsupported)
    }
}

/// Token resolver that hands back a fixed token, recording the user it saw.
struct FixedTokenResolver;

#[async_trait]
impl GitTokenResolver for FixedTokenResolver {
    async fn github_token(&self, user_id: &str) -> Result<Option<String>, CodingAgentError> {
        assert_eq!(user_id, "macro|test@macro.com");
        Ok(Some("ghp_token".to_owned()))
    }
}

fn context(webhooks: bool) -> CodingAgentToolContext {
    CodingAgentToolContext::new(Arc::new(FakeProvider { webhooks }))
}

fn request_context() -> RequestContext {
    RequestContext {
        user_id: MacroUserIdStr::try_from_email("test@macro.com").unwrap(),
    }
}

fn spawn_tool() -> SpawnCodingAgent {
    SpawnCodingAgent {
        task: "fix the bug".to_owned(),
        repository: "https://github.com/x/y".to_owned(),
        base_ref: None,
        branch_name: Some("fix/bug".to_owned()),
        model: None,
        auto_create_pr: None,
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
    let response = spawn_tool()
        .call(ServiceContext(context(false)), request_context())
        .await
        .unwrap();

    assert_eq!(response.agent.id, "sess_test");
    assert_eq!(response.agent.provider, "claude");
    assert_eq!(response.agent.status, "pending");
    assert_eq!(response.agent.branch_name.as_deref(), Some("fix/bug"));
    assert!(!response.agent.is_terminal);
    assert!(!response.watching);
}

#[tokio::test]
async fn spawn_tool_watches_when_provider_supports_webhooks() {
    let response = spawn_tool()
        .call(ServiceContext(context(true)), request_context())
        .await
        .unwrap();
    assert!(response.watching);
}

#[tokio::test]
async fn spawn_tool_resolves_user_github_token() {
    let context = CodingAgentToolContext::with_git_tokens(
        Arc::new(FakeProvider { webhooks: false }),
        Arc::new(FixedTokenResolver),
    );
    // FixedTokenResolver asserts the user id; a clean spawn confirms the token
    // path runs without error.
    let response = spawn_tool()
        .call(ServiceContext(context), request_context())
        .await
        .unwrap();
    assert_eq!(response.agent.provider, "claude");
}

#[tokio::test]
async fn status_tool_reads_provider() {
    let tool = GetCodingAgentStatus {
        agent_id: "sess_test".to_owned(),
    };

    let view = tool
        .call(ServiceContext(context(false)), request_context())
        .await
        .unwrap();

    assert_eq!(view.status, "finished");
    assert!(view.is_terminal);
    assert_eq!(
        view.pr_url.as_deref(),
        Some("https://github.com/x/y/pull/1")
    );
}
