//! CreateAutomation tool.

use crate::domain::models::{ActionKind, AgentTask, Schedule, ScheduledAction};
use crate::domain::ports::ScheduledActionRepo;
use ai::tool::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use ai::types::Model;
use async_trait::async_trait;
use chrono::Utc;
use chrono_tz::Tz;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use super::ScheduleToolContext;

fn default_enabled() -> bool {
    true
}

/// Response for [`CreateAutomation`].
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAutomationResponse {
    /// The ID of the newly created automation.
    pub id: String,
    /// The display name.
    pub name: String,
    /// Next scheduled run time (UTC ISO-8601).
    pub next_run_at: String,
}

/// Tool: create a new scheduled automation.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "CreateAutomation",
    description = "Create a new scheduled automation that runs an AI agent on a cron schedule. The schedule uses 6-field cron format: 'sec min hour dom mon dow'. Examples: '0 0 9 * * Mon-Fri' (9 AM weekdays), '0 30 8 * * *' (8:30 AM daily), '0 0 0 1 * *' (midnight on the 1st of each month)."
)]
pub struct CreateAutomation {
    #[schemars(description = "Display name for the automation.")]
    pub name: String,

    #[schemars(
        description = "Cron schedule in 6-field format: 'sec min hour dom mon dow'. Example: '0 0 9 * * Mon-Fri' for 9 AM on weekdays."
    )]
    pub schedule: String,

    #[schemars(
        description = "IANA timezone for the schedule, e.g. 'America/New_York', 'Europe/London', 'UTC'."
    )]
    pub timezone: String,

    #[schemars(
        description = "Instructions for what the AI agent should do each time this automation runs."
    )]
    pub prompt: String,

    #[schemars(description = "Whether the automation is active. Defaults to true.")]
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[async_trait]
impl<R: ScheduledActionRepo> AsyncTool<ScheduleToolContext<R>> for CreateAutomation {
    type Output = CreateAutomationResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id), err)]
    async fn call(
        &self,
        ctx: ServiceContext<ScheduleToolContext<R>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!(name=?self.name, "Create automation");

        let schedule = Schedule::from_cron(self.schedule.clone()).map_err(|e| ToolCallError {
            description: format!(
                "Invalid cron schedule '{}'. Use 6-field format: sec min hour dom mon dow.",
                self.schedule
            ),
            internal_error: e,
        })?;

        let tz = Tz::from_str(&self.timezone).map_err(|e| ToolCallError {
            description: format!(
                "Invalid timezone '{}'. Use IANA format like 'America/New_York'.",
                self.timezone
            ),
            internal_error: anyhow::anyhow!(e),
        })?;

        let next_run_at = schedule
            .next_run_after_now(tz)
            .ok_or_else(|| ToolCallError {
                description: "Schedule has no future firings.".to_string(),
                internal_error: anyhow::anyhow!("no future firings"),
            })?;

        let agent_task = AgentTask {
            model: Model::default(),
            prompt: self.prompt.clone(),
            user_prompt: self.prompt.clone(),
        };
        let task = serde_json::to_value(&agent_task).map_err(|e| ToolCallError {
            description: "failed to serialize task".to_string(),
            internal_error: e.into(),
        })?;

        let now = Utc::now();
        let action = ScheduledAction {
            id: None,
            owner: request_context.user_id,
            name: self.name.clone(),
            schedule,
            kind: ActionKind::Agent,
            created_at: now,
            updated_at: now,
            timezone: tz,
            task,
            claimed: None,
            next_run_at,
            enabled: self.enabled,
        };

        let created = ctx
            .repo
            .create_action(action)
            .await
            .map_err(|e| ToolCallError {
                description: "failed to create automation".to_string(),
                internal_error: e,
            })?;

        Ok(CreateAutomationResponse {
            id: created.id.map(|id| id.to_string()).unwrap_or_default(),
            name: created.name,
            next_run_at: created.next_run_at.to_rfc3339(),
        })
    }
}
