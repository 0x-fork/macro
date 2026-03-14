use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;
use uuid::Uuid;

pub(crate) async fn get_reminders(
    db: &PgPool,
    user_id: MacroUserIdStr<'_>,
    reminder_ids: &[String],
    done_filter: Option<bool>,
    limit: u16,
) -> Result<Vec<ReminderRow>, sqlx::Error> {
    let user_id_str: &str = user_id.as_ref();
    let limit_i64 = limit as i64;

    let parsed_ids: Option<Vec<Uuid>> = if reminder_ids.is_empty() {
        None
    } else {
        Some(
            reminder_ids
                .iter()
                .map(|s| Uuid::parse_str(s))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| sqlx::Error::TypeNotFound {
                    type_name: e.to_string(),
                })?,
        )
    };

    let rows =
        match (parsed_ids.as_deref(), done_filter) {
            (Some(ids), Some(true)) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1 AND id = ANY($3) AND done_time IS NOT NULL
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
                ids,
            )
            .fetch_all(db)
            .await?,
            (Some(ids), Some(false)) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1 AND id = ANY($3) AND done_time IS NULL
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
                ids,
            )
            .fetch_all(db)
            .await?,
            (Some(ids), None) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1 AND id = ANY($3)
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
                ids,
            )
            .fetch_all(db)
            .await?,
            (None, Some(true)) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1 AND done_time IS NOT NULL
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
            )
            .fetch_all(db)
            .await?,
            (None, Some(false)) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1 AND done_time IS NULL
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
            )
            .fetch_all(db)
            .await?,
            (None, None) => sqlx::query_as!(
                ReminderRow,
                r#"SELECT id, user_id, entity_type, entity_id, reminder_time, done_time, created_at
               FROM reminders
               WHERE user_id = $1
               ORDER BY reminder_time DESC
               LIMIT $2"#,
                user_id_str,
                limit_i64,
            )
            .fetch_all(db)
            .await?,
        };

    Ok(rows)
}

/// A row from the reminders table.
pub struct ReminderRow {
    /// The unique identifier for this reminder.
    pub id: uuid::Uuid,
    /// The user who created the reminder.
    pub user_id: String,
    /// The type of entity this reminder is attached to (e.g. "document", "email_thread").
    pub entity_type: String,
    /// The id of the entity this reminder is attached to.
    pub entity_id: uuid::Uuid,
    /// When the reminder is due.
    pub reminder_time: chrono::DateTime<chrono::Utc>,
    /// When the reminder was marked as done (if completed).
    pub done_time: Option<chrono::DateTime<chrono::Utc>>,
    /// When the reminder was created.
    pub created_at: chrono::DateTime<chrono::Utc>,
}
