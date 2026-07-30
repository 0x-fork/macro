//! Ports (trait contracts) for the reminders domain.

use chrono::{DateTime, Utc};
use entity_access::domain::models::{AnyEntityPermission, EntityAccessReceipt};
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::models::{
    CreateReminder, NewReminder, Reminder, ReminderBatch, ReminderError, ReminderFilter,
    ReminderPage, ReminderPatch, ReminderUpdate,
};

/// Source of the current time.
///
/// Injected so schedule boundaries — "exactly now", DST transitions, a cron
/// whose last firing has passed — can be tested deterministically instead of
/// relative to the wall clock.
pub trait Clock: Send + Sync + 'static {
    /// The current instant.
    fn now(&self) -> DateTime<Utc>;
}

/// The real clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// Outbound persistence port for reminders.
///
/// Every method is scoped to a user: a reminder is private to its owner, so an
/// id belonging to someone else simply misses rather than erroring.
pub trait RemindersRepo: Send + Sync + 'static {
    /// The error type returned by repository operations.
    type Err: Send + std::fmt::Debug;

    /// Insert a reminder for the user.
    fn create_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        new: &NewReminder,
    ) -> impl Future<Output = Result<Reminder, Self::Err>> + Send;

    /// Fetch one of the user's reminders.
    fn get_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<Option<Reminder>, Self::Err>> + Send;

    /// Read at most `limit` of the user's reminders matching `filter`, ordered
    /// by `(next_run_at, created_at, id)` and resuming after `filter.cursor`.
    ///
    /// The caller asks for one more than the page size to discover whether
    /// another page exists, and must use [`ReminderBatch::examined`] — not the
    /// decoded row count — to make that judgement.
    fn list_reminders(
        &self,
        user_id: &MacroUserIdStr<'_>,
        filter: &ReminderFilter,
        limit: i64,
    ) -> impl Future<Output = Result<ReminderBatch, Self::Err>> + Send;

    /// Apply `update` to one of the user's reminders, returning the new state.
    fn update_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
        update: &ReminderUpdate,
    ) -> impl Future<Output = Result<Option<Reminder>, Self::Err>> + Send;

    /// Delete one of the user's reminders. Returns `true` when a row was removed.
    fn delete_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<bool, Self::Err>> + Send;
}

/// Inbound service port: the reminders API used by drivers (HTTP).
pub trait RemindersService: Send + Sync + 'static {
    /// Create a reminder for the user.
    ///
    /// `entity_receipt` must be present whenever `request` names an entity, and
    /// must have been minted for that same entity and user — that is what
    /// proves the caller may attach a reminder to it. Standalone reminders need
    /// no receipt.
    fn create_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        request: CreateReminder,
        entity_receipt: Option<EntityAccessReceipt<AnyEntityPermission>>,
    ) -> impl Future<Output = Result<Reminder, ReminderError>> + Send;

    /// Fetch one of the user's reminders.
    fn get_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<Reminder, ReminderError>> + Send;

    /// List one page of the user's reminders, soonest firing first.
    fn list_reminders(
        &self,
        user_id: &MacroUserIdStr<'_>,
        filter: ReminderFilter,
    ) -> impl Future<Output = Result<ReminderPage, ReminderError>> + Send;

    /// Modify one of the user's reminders.
    fn update_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
        patch: ReminderPatch,
    ) -> impl Future<Output = Result<Reminder, ReminderError>> + Send;

    /// Delete one of the user's reminders.
    fn delete_reminder(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<(), ReminderError>> + Send;
}
