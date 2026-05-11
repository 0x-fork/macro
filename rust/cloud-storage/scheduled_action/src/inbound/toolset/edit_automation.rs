//! EditAutomation tool.

use crate::domain::models::{AgentTask, Schedule, ScheduledAction};
use crate::domain::ports::ScheduledActionRepo;
use ai::tool::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use chrono_tz::Tz;
use macro_uuid::Uuid;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use super::ScheduleToolContext;

/// Response for [`EditAutomation`].
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EditAutomationResponse {
    /// The automation ID.
    pub id: String,
    /// The updated display name.
    pub name: String,
    /// Whether the automation is enabled.
    pub enabled: bool,
    /// Next scheduled run time (UTC ISO-8601).
    pub next_run_at: String,
}

/// Tool: edit an existing scheduled automation.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "EditAutomation",
    description = "Edit an existing scheduled automation. Only specified fields are updated; omitted fields remain unchanged. Use ListAutomations first to find the automation ID."
)]
pub struct EditAutomation {
    #[schemars(description = "ID of the automation to edit.")]
    pub id: String,

    #[schemars(description = "New display name.")]
    pub name: Option<String>,

    #[schemars(
        description = "New cron schedule in 6-field format: 'sec min hour dom mon dow'. Example: '0 0 9 * * Mon-Fri'."
    )]
    pub schedule: Option<String>,

    #[schemars(description = "New IANA timezone, e.g. 'America/New_York'.")]
    pub timezone: Option<String>,

    #[schemars(description = "New instructions for the AI agent.")]
    pub prompt: Option<String>,

    #[schemars(description = "Enable or disable the automation.")]
    pub enabled: Option<bool>,
}

#[async_trait]
impl<R: ScheduledActionRepo> AsyncTool<ScheduleToolContext<R>> for EditAutomation {
    type Output = EditAutomationResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id, id=?self.id), err)]
    async fn call(
        &self,
        ctx: ServiceContext<ScheduleToolContext<R>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!(params=?self, "Edit automation");

        let target_id: Uuid = self.id.parse().map_err(|_| ToolCallError {
            description: format!("Invalid automation ID '{}'.", self.id),
            internal_error: anyhow::anyhow!("invalid uuid"),
        })?;

        let actions = ctx
            .repo
            .get_actions(request_context.user_id)
            .await
            .map_err(|e| ToolCallError {
                description: "failed to list automations".to_string(),
                internal_error: e,
            })?;

        let existing = actions
            .into_iter()
            .find(|a| a.id.as_ref() == Some(&target_id))
            .ok_or_else(|| ToolCallError {
                description: format!("Automation '{}' not found.", self.id),
                internal_error: anyhow::anyhow!("not found"),
            })?;

        let schedule = match &self.schedule {
            Some(s) => Schedule::from_cron(s.clone()).map_err(|e| ToolCallError {
                description: format!(
                    "Invalid cron schedule '{s}'. Use 6-field format: sec min hour dom mon dow."
                ),
                internal_error: e,
            })?,
            None => existing.schedule,
        };

        let timezone = match &self.timezone {
            Some(tz_str) => Tz::from_str(tz_str).map_err(|e| ToolCallError {
                description: format!(
                    "Invalid timezone '{tz_str}'. Use IANA format like 'America/New_York'."
                ),
                internal_error: anyhow::anyhow!(e),
            })?,
            None => existing.timezone,
        };

        let enabled = self.enabled.unwrap_or(existing.enabled);

        let task = match &self.prompt {
            Some(prompt) => {
                let mut agent_task: AgentTask =
                    serde_json::from_value(existing.task).map_err(|e| ToolCallError {
                        description: "failed to parse existing task".to_string(),
                        internal_error: e.into(),
                    })?;
                agent_task.prompt.clone_from(prompt);
                agent_task.user_prompt.clone_from(prompt);
                serde_json::to_value(&agent_task).map_err(|e| ToolCallError {
                    description: "failed to serialize task".to_string(),
                    internal_error: e.into(),
                })?
            }
            None => existing.task,
        };

        let next_run_at = schedule
            .next_run_after_now(timezone)
            .ok_or_else(|| ToolCallError {
                description: "Schedule has no future firings.".to_string(),
                internal_error: anyhow::anyhow!("no future firings"),
            })?;

        let action = ScheduledAction {
            id: Some(target_id),
            owner: existing.owner,
            name: self.name.clone().unwrap_or(existing.name),
            schedule,
            kind: existing.kind,
            created_at: existing.created_at,
            updated_at: existing.updated_at,
            timezone,
            task,
            claimed: existing.claimed,
            next_run_at,
            enabled,
        };

        let updated = ctx
            .repo
            .update_action(action)
            .await
            .map_err(|e| ToolCallError {
                description: "failed to update automation".to_string(),
                internal_error: e,
            })?;

        Ok(EditAutomationResponse {
            id: updated.id.map(|id| id.to_string()).unwrap_or_default(),
            name: updated.name,
            enabled: updated.enabled,
            next_run_at: updated.next_run_at.to_rfc3339(),
        })
    }
}
