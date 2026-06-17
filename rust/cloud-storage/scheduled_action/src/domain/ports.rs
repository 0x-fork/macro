use super::models::{
    ActionExecutionRecord, DispatchEvent, InProgressExecution, ScheduledAction,
    ScheduledActionUpdate,
};
use anyhow::Result;
use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use tokio::sync::mpsc::{Receiver, Sender};

pub trait ScheduledActionRepo: Send + Sync + 'static {
    fn create_action(
        &self,
        action: ScheduledAction,
    ) -> impl Future<Output = Result<ScheduledAction>> + Send;

    fn get_actions(
        &self,
        user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Vec<ScheduledAction>>> + Send;

    /// Return the next `limit` enabled actions ordered by `next_run_at` ASC,
    /// filtering out those currently claimed by another worker (i.e. claimed
    /// within `MAX_ACTION_TIME`). Used by the polling dispatcher to find work.
    fn get_next_unclaimed_actions(
        &self,
        limit: i64,
    ) -> impl Future<Output = Result<Vec<ScheduledAction>>> + Send;

    fn update_action(
        &self,
        action: ScheduledAction,
    ) -> impl Future<Output = Result<ScheduledAction>> + Send;

    fn delete_action(
        &self,
        id: &Uuid,
        macro_user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn claim_action(&self, id: &Uuid) -> impl Future<Output = Result<()>> + Send;

    fn release_action(&self, id: &Uuid) -> impl Future<Output = Result<()>> + Send;

    fn create_execution_record(
        &self,
        record: ActionExecutionRecord,
    ) -> impl Future<Output = Result<()>> + Send;

    fn get_execution_records(
        &self,
        action_id: &Uuid,
    ) -> impl Future<Output = Result<Vec<ActionExecutionRecord>>> + Send;

    fn update_next_run_at(&self, id: &Uuid) -> impl Future<Output = Result<()>> + Send;

    fn update_last_executed(
        &self,
        id: &Uuid,
        executed_at: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;
}

pub trait ScheduledActionService: Send + Sync + 'static {
    fn create_action(
        &self,
        action: ScheduledAction,
    ) -> impl Future<Output = Result<ScheduledAction>> + Send;

    fn get_actions(
        &self,
        user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Vec<ScheduledAction>>> + Send;

    fn update_action(
        &self,
        action: ScheduledAction,
        macro_user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<ScheduledAction>> + Send;

    fn delete_action(
        &self,
        id: &Uuid,
        macro_user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn execute_action_now(
        &self,
        id: &Uuid,
        macro_user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<InProgressExecution>> + Send;

    fn get_execution_records(
        &self,
        id: &Uuid,
        macro_user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Vec<ActionExecutionRecord>>> + Send;
}

pub trait ScheduledActionDispatcher {
    fn begin_dispatch_loop(self) -> (Sender<DispatchEvent>, Receiver<InProgressExecution>);
}

pub trait ScheduledActionExecutor {
    fn execute_action(
        &self,
        action: ScheduledAction,
    ) -> impl Future<Output = Result<InProgressExecution>> + Send;
}

/// Runs the actual work behind a scheduled action, decoupled from the
/// scheduling/lifecycle machinery (claiming, execution records, live updates)
/// that [`crate::outbound::inprocess_executor::InProcessExecutor`] owns.
///
/// The in-process executor is kind-agnostic: it calls [`ActionRunner::create_resource`]
/// up front so the caller gets a resource id synchronously, then spawns
/// [`ActionRunner::run`] for the rest. Concrete runners (e.g. the agent runner in
/// the `automations` crate) interpret `action.kind`/`action.task` and own the
/// heavy dependencies (AI tools, chat, notifications); keeping that out of here
/// is what lets the scheduling core stay a pure library.
pub trait ActionRunner: Send + Sync + 'static {
    /// Create the primary resource for this run (e.g. a chat thread) and return
    /// its id. Called synchronously before the run is spawned.
    fn create_resource(
        &self,
        action: &ScheduledAction,
    ) -> impl Future<Output = Result<String>> + Send;

    /// Execute the action against the resource created by [`Self::create_resource`].
    /// Runs inside the spawned background task.
    fn run(
        &self,
        action: &ScheduledAction,
        resource_id: &str,
    ) -> impl Future<Output = Result<()>> + Send;
}

pub trait ScheduledActionLiveUpdate: Send + Sync + 'static {
    fn publish_update(&self, update: ScheduledActionUpdate) -> impl Future<Output = ()> + Send;
}
