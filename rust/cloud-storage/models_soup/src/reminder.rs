use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A reminder that appears in the soup feed.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
pub struct SoupReminder {
    /// The unique identifier for this reminder.
    pub id: Uuid,
    /// The user who created the reminder.
    pub user_id: String,
    /// The type of entity this reminder is attached to.
    pub entity_type: String,
    /// The id of the entity this reminder is attached to.
    pub entity_id: Uuid,
    /// When the reminder is due.
    pub reminder_time: DateTime<Utc>,
    /// When the reminder was marked as done (if completed).
    pub done_time: Option<DateTime<Utc>>,
    /// When the reminder was created.
    pub created_at: DateTime<Utc>,
}
