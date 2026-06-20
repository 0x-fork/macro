//! The `CodeAgent` tool: the main agent's handoff to an autonomous coding
//! agent running in the chat's sandbox.
//!
//! Like [`Subagent`](crate::subagent), the main agent stays in control and
//! *yields* a task to this tool. Unlike `Subagent`, the work runs out-of-process
//! in a sandbox and streams rich progress ([`coding_agent::CodingEvent`]s)
//! back into the live chat via the per-request sink on [`CodingToolContext`],
//! finishing by pushing a branch and opening a PR.

use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::tool_context::CodingToolContext;

/// The structured result returned to the main agent once the coding turn ends.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CodeAgentResponse {
    /// A short natural-language summary of what the coding agent did.
    pub summary: String,
    /// The URL of the pull request that was opened, if any.
    pub pr_url: Option<String>,
    /// The branch the agent pushed, if any.
    pub branch: Option<String>,
    /// Number of files changed, if known.
    pub changed_files: Option<u64>,
    /// Why the turn ended (e.g. `end_turn`, `refusal`).
    pub stop_reason: String,
}

/// Delegate a coding task to the repository's sandboxed coding agent.
#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(
    title = "CodeAgent",
    description = "Delegate a software change to an autonomous coding agent running in an isolated sandbox that has already cloned the selected GitHub repository. The agent edits code, runs tests, pushes a branch and opens a pull request. Use this whenever the user asks to make code changes, fix a bug, or implement a feature in the selected repository. Only available when a repository is selected for the chat. Provide a detailed, self-contained description of the change."
)]
pub struct CodeAgent {
    #[schemars(
        description = "A detailed, self-contained description of the code change to make. Include the desired behavior, any relevant files or constraints, and acceptance criteria. The coding agent cannot ask the user follow-up questions mid-task, so be specific."
    )]
    pub task: String,
}

#[async_trait]
impl AsyncTool<CodingToolContext> for CodeAgent {
    type Output = CodeAgentResponse;

    #[tracing::instrument(skip_all, err)]
    async fn call(
        &self,
        service_context: ServiceContext<CodingToolContext>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let ctx = &service_context.0;

        let chat_id = ctx.chat_id.clone().ok_or_else(|| ToolCallError {
            description: "CodeAgent can only run inside a chat with a selected repository"
                .to_string(),
            internal_error: anyhow::anyhow!("no chat_id on coding tool context"),
        })?;
        let user_id = request_context.user_id.to_string();

        let outcome = ctx
            .service
            .delegate(&chat_id, &user_id, &self.task, ctx.sink.clone())
            .await
            .map_err(|e| ToolCallError {
                description: format!("the coding agent could not complete the task: {e}"),
                internal_error: anyhow::anyhow!(e),
            })?;

        Ok(CodeAgentResponse {
            summary: outcome.summary,
            pr_url: outcome.pr.as_ref().map(|p| p.url.clone()),
            branch: outcome.pr.as_ref().map(|p| p.branch.clone()),
            changed_files: outcome.pr.as_ref().and_then(|p| p.changed_files),
            stop_reason: serde_json::to_value(outcome.stop_reason)
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "end_turn".to_string()),
        })
    }
}
