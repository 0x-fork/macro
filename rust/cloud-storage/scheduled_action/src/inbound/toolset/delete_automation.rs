//! DeleteAutomation tool.

use crate::domain::ports::ScheduledActionRepo;
use ai::tool::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use macro_uuid::Uuid;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::ScheduleToolContext;

/// Response for [`DeleteAutomation`].
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAutomationResponse {
    /// Whether the deletion succeeded.
    pub success: bool,
}

/// Tool: permanently delete a scheduled automation.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "DeleteAutomation",
    description = "Permanently delete a scheduled automation. This cannot be undone. Use ListAutomations first to find the automation ID."
)]
pub struct DeleteAutomation {
    #[schemars(description = "ID of the automation to delete.")]
    pub id: String,
}

#[async_trait]
impl<R: ScheduledActionRepo> AsyncTool<ScheduleToolContext<R>> for DeleteAutomation {
    type Output = DeleteAutomationResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id, id=?self.id), err)]
    async fn call(
        &self,
        ctx: ServiceContext<ScheduleToolContext<R>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!(id=?self.id, "Delete automation");

        let target_id: Uuid = self.id.parse().map_err(|_| ToolCallError {
            description: format!("Invalid automation ID '{}'.", self.id),
            internal_error: anyhow::anyhow!("invalid uuid"),
        })?;

        let actions = ctx
            .repo
            .get_actions(request_context.user_id.clone())
            .await
            .map_err(|e| ToolCallError {
                description: "failed to list automations".to_string(),
                internal_error: e,
            })?;

        if !actions.iter().any(|a| a.id.as_ref() == Some(&target_id)) {
            return Err(ToolCallError {
                description: format!("Automation '{}' not found.", self.id),
                internal_error: anyhow::anyhow!("not found"),
            });
        }

        ctx.repo
            .delete_action(&target_id, request_context.user_id)
            .await
            .map_err(|e| ToolCallError {
                description: "failed to delete automation".to_string(),
                internal_error: e,
            })?;

        Ok(DeleteAutomationResponse { success: true })
    }
}
