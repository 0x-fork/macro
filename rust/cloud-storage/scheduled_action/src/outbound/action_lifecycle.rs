use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use serde_json::Value;

use crate::domain::models::{
    ActionExecutionRecord, AlreadyRunningError, MAX_ACTION_TIME, ScheduledAction,
    ScheduledActionUpdate,
};
use crate::domain::ports::{ActionRunner, ScheduledActionLiveUpdate, ScheduledActionRepo};

/// Reject an action that is already claimed within the staleness window.
///
/// Shared by every [`ScheduledActionExecutor`](crate::domain::ports::ScheduledActionExecutor):
/// it's the cheap in-memory pre-check before the atomic
/// [`ScheduledActionRepo::claim_action`] conditional UPDATE.
pub(crate) fn try_claim(action: &ScheduledAction) -> Result<()> {
    if let Some(claimed_at) = action.claimed {
        let elapsed = Utc::now() - claimed_at;
        if elapsed < MAX_ACTION_TIME {
            return Err(anyhow::Error::new(AlreadyRunningError {
                action_id: *action.id.as_ref().unwrap(),
            }));
        }
    }
    Ok(())
}

/// The post-claim execution lifecycle, shared by every execution mode
/// (in-process and lambda).
///
/// The caller must have already claimed the action (via [`Self::claim`] or an
/// executor that claims). The lifecycle then owns everything else: creating the
/// run resource, publishing live updates, persisting the execution record,
/// advancing `next_run_at`, and releasing the claim.
///
/// Splitting this out is what lets the in-process executor and a lambda handler
/// share one implementation: the in-process executor [`begin`](Self::begin)s
/// synchronously (so callers get a resource id) then spawns
/// [`run_to_completion`](Self::run_to_completion); a lambda handler awaits both
/// to completion inside the lambda.
pub struct ActionLifecycle<Rpo, Live, Runner> {
    repo: Arc<Rpo>,
    live_updates: Arc<Live>,
    runner: Arc<Runner>,
}

// Manual `Clone` (derive would require `Rpo: Clone` etc.) — every field is an
// `Arc`, so cloning the lifecycle to move into a spawned task is cheap.
impl<Rpo, Live, Runner> Clone for ActionLifecycle<Rpo, Live, Runner> {
    fn clone(&self) -> Self {
        Self {
            repo: Arc::clone(&self.repo),
            live_updates: Arc::clone(&self.live_updates),
            runner: Arc::clone(&self.runner),
        }
    }
}

impl<Rpo, Live, Runner> ActionLifecycle<Rpo, Live, Runner>
where
    Rpo: ScheduledActionRepo,
    Live: ScheduledActionLiveUpdate,
    Runner: ActionRunner,
{
    pub fn new(repo: Arc<Rpo>, live_updates: Arc<Live>, runner: Arc<Runner>) -> Self {
        Self {
            repo,
            live_updates,
            runner,
        }
    }

    /// Atomically claim the action. Pair with [`try_claim`] for the in-memory
    /// pre-check. Used by the in-process executor; a lambda handler skips this
    /// because the trigger-side executor already claimed.
    pub async fn claim(&self, id: &macro_uuid::Uuid) -> Result<()> {
        self.repo.claim_action(id).await
    }

    /// Create the run resource and announce the run has started. If resource
    /// creation fails the claim is released (otherwise the action would stay
    /// claimed until the staleness window elapses). Returns the resource id.
    pub async fn begin(&self, action: &ScheduledAction) -> Result<String> {
        let id = *action.id.as_ref().unwrap();
        let resource_id = match self.runner.create_resource(action).await {
            Ok(resource_id) => resource_id,
            Err(e) => {
                if let Err(release_err) = self.repo.release_action(&id).await {
                    tracing::error!(
                        error=?release_err,
                        action_id=?id,
                        "failed to release action claim after create_resource error",
                    );
                }
                return Err(e);
            }
        };

        self.live_updates
            .publish_update(ScheduledActionUpdate::Started {
                owner: action.owner.clone(),
                action_id: id,
                chat_id: resource_id.clone(),
            })
            .await;

        Ok(resource_id)
    }

    /// Run the action to completion against the resource from [`Self::begin`]:
    /// execute the runner, persist the outcome, advance `next_run_at`, release
    /// the claim, and announce completion.
    ///
    /// Never returns an error — a failed run is recorded as an unsuccessful
    /// execution record, not propagated, so the claim is always released.
    pub async fn run_to_completion(&self, action: &ScheduledAction, resource_id: &str) {
        let id = *action.id.as_ref().unwrap();
        let start_time = Utc::now();

        let result = self.runner.run(action, resource_id).await;
        let end_time = Utc::now();
        let is_success = result.is_ok();

        let record = ActionExecutionRecord {
            id: None,
            action_id: id,
            resource_id: Some(resource_id.to_string()),
            start_time,
            end_time,
            is_success,
            result: match &result {
                Ok(_) => Value::Null,
                Err(e) => Value::String(e.to_string()),
            },
            created_at: end_time,
        };

        if let Err(e) = self.repo.create_execution_record(record).await {
            tracing::error!(error=?e, action_id=?id, "failed to save execution record");
        }

        if let Err(e) = self.repo.update_last_executed(&id, end_time).await {
            tracing::error!(error=?e, action_id=?id, "failed to update last executed time");
        }

        // Recompute next_run_at based on the cron, so the UI shows the upcoming
        // run after the one we just completed. The repo fetches the current
        // schedule + timezone itself and skips the update if there's no future
        // fire time.
        if let Err(e) = self.repo.update_next_run_at(&id).await {
            tracing::error!(error=?e, action_id=?id, "failed to update next_run_at");
        }

        if let Err(e) = self.repo.release_action(&id).await {
            tracing::error!(error=?e, action_id=?id, "failed to release action claim");
        }

        // Fire the stop event after release so that any follow-up "run now" the
        // UI issues in response will not race the claim.
        self.live_updates
            .publish_update(ScheduledActionUpdate::Stopped {
                owner: action.owner.clone(),
                action_id: id,
                chat_id: resource_id.to_string(),
                is_success,
            })
            .await;

        if let Err(e) = &result {
            tracing::error!(error=?e, action_id=?id, "scheduled action execution failed");
        }
    }
}
