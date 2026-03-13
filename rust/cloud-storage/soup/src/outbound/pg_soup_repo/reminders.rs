use macro_user_id::user_id::MacroUserIdStr;
use models_soup::{item::SoupItem, reminder::SoupReminder};
use sqlx::PgPool;
use uuid::Uuid;

pub(crate) async fn get_reminders(
    db: &PgPool,
    user_id: MacroUserIdStr<'_>,
    reminder_ids: &[String],
    done_filter: Option<bool>,
    limit: u16,
) -> Result<Vec<SoupItem>, sqlx::Error> {
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

    Ok(rows
        .into_iter()
        .map(|r| {
            SoupItem::Reminder(SoupReminder {
                id: r.id,
                user_id: r.user_id,
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                reminder_time: r.reminder_time,
                done_time: r.done_time,
                created_at: r.created_at,
            })
        })
        .collect())
}

struct ReminderRow {
    id: uuid::Uuid,
    user_id: String,
    entity_type: String,
    entity_id: uuid::Uuid,
    reminder_time: chrono::DateTime<chrono::Utc>,
    done_time: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}
