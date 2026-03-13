use super::Reminder;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use uuid::Uuid;

/// Creates a new reminder for a user.
#[tracing::instrument(skip(db), err)]
pub async fn create_reminder(
    db: &Pool<Postgres>,
    user_id: &str,
    entity_type: &str,
    entity_id: Uuid,
    reminder_time: DateTime<Utc>,
) -> anyhow::Result<Reminder> {
    let row = sqlx::query_as!(
        Reminder,
        r#"
        INSERT INTO reminders (user_id, entity_type, entity_id, reminder_time)
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            user_id,
            entity_type,
            entity_id,
            reminder_time,
            done_time,
            created_at
        "#,
        user_id,
        entity_type,
        entity_id,
        reminder_time,
    )
    .fetch_one(db)
    .await?;

    Ok(row)
}

/// Gets all pending (not done) reminders for a user.
#[tracing::instrument(skip(db), err)]
pub async fn get_pending_reminders(
    db: &Pool<Postgres>,
    user_id: &str,
) -> anyhow::Result<Vec<Reminder>> {
    let rows = sqlx::query_as!(
        Reminder,
        r#"
        SELECT
            id,
            user_id,
            entity_type,
            entity_id,
            reminder_time,
            done_time,
            created_at
        FROM reminders
        WHERE user_id = $1 AND done_time IS NULL
        ORDER BY reminder_time ASC
        "#,
        user_id,
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

#[cfg(test)]
mod test;
