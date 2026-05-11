//! Toolset inbound adapter for scheduled automations.

mod create_automation;
mod delete_automation;
mod edit_automation;
mod list_automations;

use crate::domain::ports::ScheduledActionRepo;
use ai::tool::AsyncToolSet;
use create_automation::CreateAutomation;
use delete_automation::DeleteAutomation;
use edit_automation::EditAutomation;
use list_automations::ListAutomations;
use std::sync::Arc;

/// Service context for scheduled-action AI tools.
pub struct ScheduleToolContext<R: ScheduledActionRepo> {
    /// The scheduled action repository.
    pub repo: Arc<R>,
}

impl<R: ScheduledActionRepo> Clone for ScheduleToolContext<R> {
    fn clone(&self) -> Self {
        Self {
            repo: self.repo.clone(),
        }
    }
}

impl<R: ScheduledActionRepo> ScheduleToolContext<R> {
    /// Create a new schedule tool context.
    pub fn new(repo: R) -> Self {
        Self {
            repo: Arc::new(repo),
        }
    }
}

/// Create a scheduled-action toolset.
pub fn schedule_toolset<R: ScheduledActionRepo>() -> AsyncToolSet<ScheduleToolContext<R>> {
    AsyncToolSet::new()
        .add_tool::<ListAutomations, ScheduleToolContext<R>>()
        .add_tool::<CreateAutomation, ScheduleToolContext<R>>()
        .add_tool::<EditAutomation, ScheduleToolContext<R>>()
        .add_tool::<DeleteAutomation, ScheduleToolContext<R>>()
}
