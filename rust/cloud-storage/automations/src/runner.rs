use std::sync::Arc;

use ai_tools::ToolServiceContext;
use anyhow::Result;
use notification::domain::service::SqsNotificationIngress;
use notification::outbound::queue::SqsQueue;
use scheduled_action::domain::models::ScheduledAction;
use scheduled_action::domain::ports::ActionRunner;
use sqlx::PgPool;

use crate::agent_task;

/// [`ActionRunner`] for [`ActionKind::Agent`](scheduled_action::domain::models::ActionKind)
/// actions: creates a chat thread as the run resource and drives an AI agent
/// loop (with the owner's memory + tools) against the action's task.
///
/// This is the agent-specific half of the scheduled-action executor; it owns the
/// heavy AI/chat/notification dependencies that the scheduling core in
/// `scheduled_action` deliberately does not.
pub struct AgentActionRunner {
    db: PgPool,
    tool_context: ToolServiceContext,
    notification_ingress: Arc<SqsNotificationIngress<SqsQueue>>,
}

impl AgentActionRunner {
    pub fn new(
        db: PgPool,
        tool_context: ToolServiceContext,
        notification_ingress: Arc<SqsNotificationIngress<SqsQueue>>,
    ) -> Self {
        Self {
            db,
            tool_context,
            notification_ingress,
        }
    }
}

impl ActionRunner for AgentActionRunner {
    async fn create_resource(&self, action: &ScheduledAction) -> Result<String> {
        agent_task::create_run_chat(&self.db, action).await
    }

    async fn run(&self, action: &ScheduledAction, resource_id: &str) -> Result<()> {
        agent_task::run_agent_task(
            &self.db,
            &self.tool_context,
            &self.notification_ingress,
            action,
            resource_id,
        )
        .await
    }
}
