use super::Reminder;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use uuid::Uuid;

/// Error returned by [`update_reminder_time`].
#[derive(Debug, thiserror::Error)]
pub enum UpdateReminderTimeError {
    /// The reminder was not found or belongs to another user.
    #[error("reminder not found")]
    NotFound,
    /// A database error occurred.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Updates the reminder_time of an existing reminder.
#[tracing::instrument(skip(db), err)]
pub async fn update_reminder_time(
    db: &Pool<Postgres>,
    reminder_id: Uuid,
    user_id: &str,
    reminder_time: DateTime<Utc>,
) -> Result<Reminder, UpdateReminderTimeError> {
    let row = sqlx::query_as!(
        Reminder,
        r#"
        UPDATE reminders
        SET reminder_time = $3, done_time = NULL
        WHERE id = $1 AND user_id = $2
        RETURNING
            id,
            user_id,
            entity_type,
            entity_id,
            reminder_time,
            done_time,
            created_at
        "#,
        reminder_id,
        user_id,
        reminder_time,
    )
    .fetch_optional(db)
    .await?;

    row.ok_or(UpdateReminderTimeError::NotFound)
}
