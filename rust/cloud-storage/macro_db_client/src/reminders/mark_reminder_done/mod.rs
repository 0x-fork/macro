use sqlx::{Pool, Postgres};
use uuid::Uuid;

/// Error returned by [`mark_reminder_done`].
#[derive(Debug, thiserror::Error)]
pub enum MarkReminderDoneError {
    /// The reminder was not found or is already done.
    #[error("reminder not found or already done")]
    NotFound,
    /// A database error occurred.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Marks a reminder as done by setting the done_time to now.
#[tracing::instrument(skip(db), err)]
pub async fn mark_reminder_done(
    db: &Pool<Postgres>,
    reminder_id: Uuid,
    user_id: &str,
) -> Result<(), MarkReminderDoneError> {
    let result = sqlx::query!(
        r#"
        UPDATE reminders
        SET done_time = NOW()
        WHERE id = $1 AND user_id = $2 AND done_time IS NULL
        "#,
        reminder_id,
        user_id,
    )
    .execute(db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(MarkReminderDoneError::NotFound);
    }

    Ok(())
}

#[cfg(test)]
mod test;
