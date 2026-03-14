use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Metadata about a reminder attached to a soup item.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
pub struct ReminderMetadata {
    /// The unique identifier for this reminder.
    pub reminder_id: Uuid,
    /// When the reminder is due.
    pub reminder_time: DateTime<Utc>,
    /// When the reminder was marked as done (if completed).
    pub done_time: Option<DateTime<Utc>>,
}
