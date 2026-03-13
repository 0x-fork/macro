mod create_reminder;
mod mark_reminder_done;

pub use create_reminder::*;
pub use mark_reminder_done::*;

use chrono::{DateTime, Utc};
use uuid::Uuid;

/// A reminder row returned from the database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Reminder {
    /// Unique identifier for the reminder.
    pub id: Uuid,
    /// The user who created the reminder.
    pub user_id: String,
    /// The type of entity being reminded about.
    pub entity_type: String,
    /// The ID of the entity being reminded about.
    pub entity_id: Uuid,
    /// When the reminder should fire.
    pub reminder_time: DateTime<Utc>,
    /// When the reminder was marked done, if ever.
    pub done_time: Option<DateTime<Utc>>,
    /// When the reminder was created.
    pub created_at: DateTime<Utc>,
}
