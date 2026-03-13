use super::*;
use crate::reminders::create_reminder;
use chrono::Utc;
use sqlx::{Pool, Postgres};

#[sqlx::test(fixtures(path = "../../../fixtures"))]
async fn test_mark_reminder_done(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let entity_id = Uuid::new_v4();
    let reminder_time = Utc::now() + chrono::Duration::hours(1);

    let reminder = create_reminder(
        &pool,
        "macro|user@user.com",
        "document",
        entity_id,
        reminder_time,
    )
    .await?;

    mark_reminder_done(&pool, reminder.id, "macro|user@user.com").await?;

    // Verify it's no longer in pending
    let pending = crate::reminders::get_pending_reminders(&pool, "macro|user@user.com").await?;
    assert_eq!(pending.len(), 0);

    Ok(())
}

#[sqlx::test(fixtures(path = "../../../fixtures"))]
async fn test_mark_reminder_done_not_found(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let result = mark_reminder_done(&pool, Uuid::new_v4(), "macro|user@user.com").await;
    assert!(result.is_err());

    Ok(())
}
