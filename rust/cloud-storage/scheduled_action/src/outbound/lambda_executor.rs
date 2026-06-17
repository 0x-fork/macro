use std::sync::Arc;

use anyhow::Result;
use lambda_client::Lambda;

use crate::domain::models::{InProgressExecution, ScheduledAction};
use crate::domain::ports::{ScheduledActionExecutor, ScheduledActionRepo};
use crate::outbound::action_lifecycle::try_claim;

/// A [`ScheduledActionExecutor`] that runs the work in an AWS Lambda instead of
/// the scheduler process. Use it for heavy or long-running actions (e.g. memory
/// generation) that shouldn't occupy the dispatcher host.
///
/// It claims the action on the trigger side — exactly like the in-process
/// executor — then fire-and-forget invokes `function_name` with the full
/// [`ScheduledAction`] as the event payload. The lambda handler is expected to
/// rebuild an [`ActionLifecycle`](crate::outbound::action_lifecycle::ActionLifecycle)
/// with its own [`ActionRunner`](crate::domain::ports::ActionRunner) and run it
/// to completion (which records the outcome and releases the claim). The handler
/// must NOT re-claim: the claim is already held here.
pub struct LambdaExecutor<Rpo> {
    repo: Arc<Rpo>,
    lambda: Arc<Lambda>,
    function_name: String,
}

impl<Rpo> LambdaExecutor<Rpo> {
    pub fn new(repo: Arc<Rpo>, lambda: Arc<Lambda>, function_name: String) -> Self {
        Self {
            repo,
            lambda,
            function_name,
        }
    }
}

impl<Rpo> ScheduledActionExecutor for LambdaExecutor<Rpo>
where
    Rpo: ScheduledActionRepo + Send + Sync + 'static,
{
    async fn execute_action(&self, action: ScheduledAction) -> Result<InProgressExecution> {
        try_claim(&action)?;

        let id = *action.id.as_ref().unwrap();
        self.repo.claim_action(&id).await?;

        // Fire-and-forget: the lambda handler owns the rest of the lifecycle
        // (resource creation, run, record, release) via ActionLifecycle.
        if let Err(e) = self.lambda.invoke_event(&self.function_name, &action).await {
            // Triggering failed, so nothing downstream will release the claim —
            // release it here, otherwise the action is stuck until the staleness
            // window elapses.
            if let Err(release_err) = self.repo.release_action(&id).await {
                tracing::error!(
                    error=?release_err,
                    action_id=?id,
                    "failed to release action claim after lambda invoke error",
                );
            }
            return Err(e);
        }

        Ok(InProgressExecution {
            action_id: id,
            chat_id: None,
        })
    }
}
