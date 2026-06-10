use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::{Pool, Postgres};

const LINK_ID: &str = "00000000-0000-0000-0000-000000000f01";
const SENT_MESSAGE_ID: &str = "00000000-0000-0000-0000-00000000f501";

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../fixtures", scripts("message_open_tracking"))
)]
async fn set_message_open_tracking_token_persists_token(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let message_id = Uuid::parse_str(SENT_MESSAGE_ID)?;
    let link_id = Uuid::parse_str(LINK_ID)?;
    let token = Uuid::new_v4();

    set_message_open_tracking_token(&pool, message_id, link_id, token).await?;

    let stored: Option<Uuid> = sqlx::query_scalar!(
        r#"SELECT open_tracking_token FROM email_messages WHERE id = $1"#,
        message_id
    )
    .fetch_one(&pool)
    .await?;

    assert_eq!(stored, Some(token));

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../fixtures", scripts("message_open_tracking"))
)]
async fn set_message_open_tracking_token_errors_when_no_match(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let message_id = Uuid::parse_str(SENT_MESSAGE_ID)?;
    // A link that doesn't own the message: nothing should match, and the
    // caller must learn the token wasn't persisted rather than proceed.
    let wrong_link_id = Uuid::new_v4();
    let token = Uuid::new_v4();

    let result = set_message_open_tracking_token(&pool, message_id, wrong_link_id, token).await;

    assert!(result.is_err());

    Ok(())
}
