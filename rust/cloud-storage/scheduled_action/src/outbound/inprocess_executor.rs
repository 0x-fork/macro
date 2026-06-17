use std::sync::Arc;

use anyhow::Result;

use crate::domain::models::{InProgressExecution, ScheduledAction};
use crate::domain::ports::{
    ActionRunner, ScheduledActionExecutor, ScheduledActionLiveUpdate, ScheduledActionRepo,
};
use crate::outbound::action_lifecycle::{ActionLifecycle, try_claim};

/// In-process [`ScheduledActionExecutor`]: runs the action on the current host
/// (no lambda hop) by delegating the actual work to an injected [`ActionRunner`].
///
/// It claims the action, creates the run resource synchronously (so the caller
/// gets a resource id back immediately), then spawns the rest of the
/// [`ActionLifecycle`] in the background. Everything specific to *what* the
/// action does lives in the [`ActionRunner`]; the kind-agnostic lifecycle lives
/// in [`ActionLifecycle`], which a lambda handler can reuse to run the same work
/// out-of-process.
pub struct InProcessExecutor<Rpo, Live, Runner> {
    lifecycle: ActionLifecycle<Rpo, Live, Runner>,
}

impl<Rpo, Live, Runner> InProcessExecutor<Rpo, Live, Runner>
where
    Rpo: ScheduledActionRepo,
    Live: ScheduledActionLiveUpdate,
    Runner: ActionRunner,
{
    pub fn new(repo: Arc<Rpo>, live_updates: Arc<Live>, runner: Arc<Runner>) -> Self {
        Self {
            lifecycle: ActionLifecycle::new(repo, live_updates, runner),
        }
    }
}

impl<Rpo, Live, Runner> ScheduledActionExecutor for InProcessExecutor<Rpo, Live, Runner>
where
    Rpo: ScheduledActionRepo + Send + Sync + 'static,
    Live: ScheduledActionLiveUpdate,
    Runner: ActionRunner,
{
    async fn execute_action(&self, action: ScheduledAction) -> Result<InProgressExecution> {
        try_claim(&action)?;

        let id = *action.id.as_ref().unwrap();
        self.lifecycle.claim(&id).await?;

        // Create the resource up front so the caller gets a resource id
        // synchronously and the eventual execution record can link back to it.
        let resource_id = self.lifecycle.begin(&action).await?;

        let execution = InProgressExecution {
            action_id: id,
            chat_id: Some(resource_id.clone()),
        };

        // Run the rest in the background so execute_action returns immediately.
        let lifecycle = self.lifecycle.clone();
        tokio::spawn(async move {
            lifecycle.run_to_completion(&action, &resource_id).await;
        });

        Ok(execution)
    }
}
