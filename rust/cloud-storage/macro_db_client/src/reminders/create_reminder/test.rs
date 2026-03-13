use super::*;
use chrono::Utc;

#[sqlx::test(fixtures(path = "../../../fixtures"))]
async fn test_create_reminder(pool: Pool<Postgres>) -> anyhow::Result<()> {
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

    assert_eq!(reminder.user_id, "macro|user@user.com");
    assert_eq!(reminder.entity_type, "document");
    assert_eq!(reminder.entity_id, entity_id);
    assert!(reminder.done_time.is_none());

    Ok(())
}

#[sqlx::test(fixtures(path = "../../../fixtures"))]
async fn test_get_pending_reminders(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let entity_id = Uuid::new_v4();
    let reminder_time = Utc::now() + chrono::Duration::hours(1);

    create_reminder(
        &pool,
        "macro|user@user.com",
        "document",
        entity_id,
        reminder_time,
    )
    .await?;

    let pending = get_pending_reminders(&pool, "macro|user@user.com").await?;
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].entity_id, entity_id);

    Ok(())
}
