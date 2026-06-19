//! AI toolset for orchestrating coding agents from the Macro agent.
//!
//! The tools drive a single [`CodingAgentProvider`] (Claude Managed Agents)
//! through the generic contract, so the Macro agent can spawn an agent on a
//! repo, follow up, check status, and stop it. Per-request the spawn tool
//! resolves the user's GitHub token (via [`GitTokenResolver`]) so the provider
//! can clone the repo on the user's behalf.

#[cfg(test)]
mod test;

use std::sync::Arc;

use ai_toolset::{
    AsyncTool, AsyncToolCollection, RequestContext, ServiceContext, ToolCallError, ToolResult,
};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::domain::models::{
    AgentCorrelation, AgentPrompt, AgentSource, AgentTarget, CodingAgent, CodingAgentError,
    CodingAgentId, LaunchAgentRequest,
};
use crate::domain::ports::{CodingAgentProvider, GitTokenResolver};

/// Context for the coding-agent tools: the backend provider plus an optional
/// resolver for the spawning user's GitHub token.
#[derive(Clone)]
pub struct CodingAgentToolContext {
    /// The backend that runs coding agents.
    pub provider: Arc<dyn CodingAgentProvider>,
    /// Resolves the spawning user's GitHub token for repo cloning. When absent,
    /// agents are launched without a token (public repos only).
    pub git_tokens: Option<Arc<dyn GitTokenResolver>>,
}

impl CodingAgentToolContext {
    /// Build a context with no GitHub token resolver (public repos only).
    pub fn new(provider: Arc<dyn CodingAgentProvider>) -> Self {
        Self {
            provider,
            git_tokens: None,
        }
    }

    /// Build a context that resolves per-user GitHub tokens for cloning.
    pub fn with_git_tokens(
        provider: Arc<dyn CodingAgentProvider>,
        git_tokens: Arc<dyn GitTokenResolver>,
    ) -> Self {
        Self {
            provider,
            git_tokens: Some(git_tokens),
        }
    }
}

/// Build the coding-agent toolset for AI agents.
pub fn coding_agent_toolset() -> AsyncToolCollection<CodingAgentToolContext> {
    AsyncToolCollection::new()
        .add_tool::<SpawnCodingAgent, CodingAgentToolContext>()
        .add_tool::<GetCodingAgentStatus, CodingAgentToolContext>()
        .add_tool::<FollowUpCodingAgent, CodingAgentToolContext>()
        .add_tool::<StopCodingAgent, CodingAgentToolContext>()
}

/// Map a provider error to a tool error with an actionable description.
fn tool_error(action: &str, error: CodingAgentError) -> ToolCallError {
    ToolCallError {
        description: format!("Failed to {action}: {error}"),
        internal_error: anyhow::Error::new(error),
    }
}

/// A normalized view of a coding agent, returned by the tools.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CodingAgentView {
    /// Provider-assigned agent id; pass this to status / follow-up tools.
    pub id: String,
    /// Which backend runs the agent (e.g. "claude").
    pub provider: String,
    /// Normalized status: pending, running, awaiting_input, finished, failed, stopped, expired.
    pub status: String,
    /// Whether the agent has reached a terminal state.
    pub is_terminal: bool,
    /// Human-friendly name, if assigned.
    pub name: Option<String>,
    /// Branch the agent is pushing work to, if known.
    pub branch_name: Option<String>,
    /// Pull request URL, once opened.
    pub pr_url: Option<String>,
    /// URL to view the agent in the provider UI, if available.
    pub web_url: Option<String>,
    /// Short progress/result summary, if available.
    pub summary: Option<String>,
}

impl From<CodingAgent> for CodingAgentView {
    fn from(agent: CodingAgent) -> Self {
        Self {
            id: agent.id.0,
            provider: agent.provider.as_str().to_owned(),
            is_terminal: agent.status.is_terminal(),
            status: agent.status.as_str().to_owned(),
            name: agent.name,
            branch_name: agent.branch_name,
            pr_url: agent.pr_url,
            web_url: agent.web_url,
            summary: agent.summary,
        }
    }
}

/// Build the routing correlation for a launched agent from the request context.
fn correlation_for(request_context: &RequestContext) -> AgentCorrelation {
    AgentCorrelation {
        user_id: request_context.user_id.to_string(),
        chat_id: None,
    }
}

/// Spawn a new cloud coding agent on a repository.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "SpawnCodingAgent",
    description = "Spawn an autonomous cloud coding agent to work on a code task in a GitHub repository. The agent runs remotely, writes code, and (by default) opens a pull request. Returns the agent's id and initial status; use GetCodingAgentStatus to check progress and FollowUpCodingAgent to give it more instructions. Use this for self-contained coding tasks like fixing a bug, adding a test, or implementing a small feature."
)]
pub struct SpawnCodingAgent {
    /// The coding task for the agent.
    #[schemars(
        description = "A clear, self-contained description of the coding task. Include the desired outcome and any constraints, as the agent works autonomously without further input unless you follow up."
    )]
    pub task: String,
    /// The repository to work on.
    #[schemars(
        description = "The GitHub repository URL the agent should work on, e.g. \"https://github.com/macro-inc/macro\"."
    )]
    pub repository: String,
    /// Optional starting ref.
    #[schemars(
        description = "Optional branch, tag, or commit to start from. Defaults to the repository's default branch."
    )]
    #[serde(default)]
    pub base_ref: Option<String>,
    /// Optional target branch.
    #[schemars(
        description = "Optional name for the branch the agent should push its work to. The provider generates one if omitted."
    )]
    #[serde(default)]
    pub branch_name: Option<String>,
    /// Optional model override.
    #[schemars(
        description = "Optional model override for the coding agent. Omit to use the provider default."
    )]
    #[serde(default)]
    pub model: Option<String>,
    /// Whether to open a PR. Defaults to true.
    #[schemars(
        description = "Whether the agent should open a pull request with its work. Defaults to true."
    )]
    #[serde(default)]
    pub auto_create_pr: Option<bool>,
}

/// Response from spawning a coding agent.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SpawnCodingAgentResponse {
    /// The launched agent.
    pub agent: CodingAgentView,
    /// Whether Macro will receive status-change webhooks for this agent. When
    /// false, poll with GetCodingAgentStatus.
    pub watching: bool,
}

#[async_trait]
impl AsyncTool<CodingAgentToolContext> for SpawnCodingAgent {
    type Output = SpawnCodingAgentResponse;

    #[tracing::instrument(skip_all, fields(user_id = ?request_context.user_id, repository = %self.repository), err)]
    async fn call(
        &self,
        service_context: ServiceContext<CodingAgentToolContext>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        // Resolve the spawning user's GitHub token so the agent can clone the
        // repo on their behalf (None → unauthenticated clone, public repos only).
        let git_token = match &service_context.git_tokens {
            Some(resolver) => resolver
                .github_token(&request_context.user_id.to_string())
                .await
                .map_err(|e| tool_error("resolve your GitHub token", e))?,
            None => None,
        };

        let request = LaunchAgentRequest {
            prompt: AgentPrompt::text(self.task.clone()),
            source: AgentSource {
                repository: self.repository.clone(),
                git_ref: self.base_ref.clone(),
            },
            model: self.model.clone(),
            target: AgentTarget {
                branch_name: self.branch_name.clone(),
                auto_create_pr: self.auto_create_pr.unwrap_or(true),
            },
            git_token,
            // Round-tripped by the provider so completion routes back to the user.
            correlation: Some(correlation_for(&request_context)),
            provider_options: serde_json::Map::new(),
        };

        let watching = service_context.provider.capabilities().webhooks;

        let agent = service_context
            .provider
            .launch(request)
            .await
            .map_err(|e| tool_error("spawn the coding agent", e))?;

        tracing::info!(agent_id = %agent.id, provider = %agent.provider, "spawned coding agent");

        Ok(SpawnCodingAgentResponse {
            agent: agent.into(),
            watching,
        })
    }
}

/// Check the current status of a coding agent.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "GetCodingAgentStatus",
    description = "Get the current status and result of a coding agent previously spawned with SpawnCodingAgent. Use this to check progress, see whether it finished, and retrieve the pull request URL once available."
)]
pub struct GetCodingAgentStatus {
    /// The agent id returned by SpawnCodingAgent.
    #[schemars(description = "The id of the coding agent, as returned by SpawnCodingAgent.")]
    pub agent_id: String,
}

#[async_trait]
impl AsyncTool<CodingAgentToolContext> for GetCodingAgentStatus {
    type Output = CodingAgentView;

    #[tracing::instrument(skip_all, fields(user_id = ?_request_context.user_id, agent_id = %self.agent_id), err)]
    async fn call(
        &self,
        service_context: ServiceContext<CodingAgentToolContext>,
        _request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let agent = service_context
            .provider
            .get(&CodingAgentId(self.agent_id.clone()))
            .await
            .map_err(|e| tool_error("get the coding agent status", e))?;
        Ok(agent.into())
    }
}

/// Send a follow-up instruction to a coding agent.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "FollowUpCodingAgent",
    description = "Send a follow-up instruction to an existing coding agent, e.g. to refine its approach, address review feedback, or correct course. The agent continues working on the same branch."
)]
pub struct FollowUpCodingAgent {
    /// The agent id returned by SpawnCodingAgent.
    #[schemars(description = "The id of the coding agent to follow up with.")]
    pub agent_id: String,
    /// The follow-up instruction.
    #[schemars(description = "The additional instruction for the agent.")]
    pub message: String,
}

/// Response from an action that succeeds without returning data.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CodingAgentActionResponse {
    /// Whether the action succeeded.
    pub success: bool,
}

#[async_trait]
impl AsyncTool<CodingAgentToolContext> for FollowUpCodingAgent {
    type Output = CodingAgentActionResponse;

    #[tracing::instrument(skip_all, fields(user_id = ?_request_context.user_id, agent_id = %self.agent_id), err)]
    async fn call(
        &self,
        service_context: ServiceContext<CodingAgentToolContext>,
        _request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        service_context
            .provider
            .follow_up(
                &CodingAgentId(self.agent_id.clone()),
                AgentPrompt::text(self.message.clone()),
            )
            .await
            .map_err(|e| tool_error("send the follow-up instruction", e))?;
        Ok(CodingAgentActionResponse { success: true })
    }
}

/// Stop an in-progress coding agent.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "StopCodingAgent",
    description = "Stop an in-progress coding agent before it finishes. Use this to cancel work that is no longer needed or was started in error."
)]
pub struct StopCodingAgent {
    /// The agent id returned by SpawnCodingAgent.
    #[schemars(description = "The id of the coding agent to stop.")]
    pub agent_id: String,
}

#[async_trait]
impl AsyncTool<CodingAgentToolContext> for StopCodingAgent {
    type Output = CodingAgentActionResponse;

    #[tracing::instrument(skip_all, fields(user_id = ?_request_context.user_id, agent_id = %self.agent_id), err)]
    async fn call(
        &self,
        service_context: ServiceContext<CodingAgentToolContext>,
        _request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        service_context
            .provider
            .stop(&CodingAgentId(self.agent_id.clone()))
            .await
            .map_err(|e| tool_error("stop the coding agent", e))?;
        Ok(CodingAgentActionResponse { success: true })
    }
}
