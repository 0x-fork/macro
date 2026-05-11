//! ListAutomations tool.

use crate::domain::models::AgentTask;
use crate::domain::ports::ScheduledActionRepo;
use ai::tool::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::ScheduleToolContext;

/// A single automation in the response.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSummary {
    /// Unique identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Cron schedule expression.
    pub schedule: String,
    /// IANA timezone.
    pub timezone: String,
    /// The AI agent prompt.
    pub prompt: String,
    /// Whether the automation is active.
    pub enabled: bool,
    /// Next scheduled run time (UTC ISO-8601).
    pub next_run_at: String,
}

/// Response for [`ListAutomations`].
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListAutomationsResponse {
    /// The user's automations.
    pub automations: Vec<AutomationSummary>,
    /// Human-readable summary.
    pub summary: String,
}

/// Tool: list the user's scheduled automations.
#[derive(Debug, Deserialize, JsonSchema, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "ListAutomations",
    description = "List the user's scheduled automations. Returns all configured automations with their names, cron schedules, enabled status, and next run time. Use this to see what automations exist before creating, editing, or deleting them."
)]
pub struct ListAutomations {}

#[async_trait]
impl<R: ScheduledActionRepo> AsyncTool<ScheduleToolContext<R>> for ListAutomations {
    type Output = ListAutomationsResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id), err)]
    async fn call(
        &self,
        ctx: ServiceContext<ScheduleToolContext<R>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!("List automations");

        let actions = ctx
            .repo
            .get_actions(request_context.user_id)
            .await
            .map_err(|e| ToolCallError {
                description: "failed to list automations".to_string(),
                internal_error: e,
            })?;

        let automations: Vec<AutomationSummary> = actions
            .into_iter()
            .map(|a| {
                let prompt = serde_json::from_value::<AgentTask>(a.task.clone())
                    .map(|t| t.user_prompt)
                    .unwrap_or_default();
                AutomationSummary {
                    id: a.id.map(|id| id.to_string()).unwrap_or_default(),
                    name: a.name,
                    schedule: a.schedule.as_str().to_string(),
                    timezone: a.timezone.to_string(),
                    prompt,
                    enabled: a.enabled,
                    next_run_at: a.next_run_at.to_rfc3339(),
                }
            })
            .collect();

        let count = automations.len();
        let enabled = automations.iter().filter(|a| a.enabled).count();
        let summary = if count == 0 {
            "No automations configured.".to_string()
        } else {
            format!(
                "Found {count} automation{} ({enabled} enabled).",
                if count == 1 { "" } else { "s" }
            )
        };

        Ok(ListAutomationsResponse {
            automations,
            summary,
        })
    }
}
