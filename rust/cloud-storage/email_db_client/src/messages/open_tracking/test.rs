use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::{Pool, Postgres};

const LINK_ID: &str = "00000000-0000-0000-0000-000000000f01";
const SENT_MESSAGE_ID: &str = "00000000-0000-0000-0000-00000000f501";
const DRAFT_MESSAGE_ID: &str = "00000000-0000-0000-0000-00000000f502";

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../fixtures", scripts("message_open_tracking"))
)]
async fn record_message_open_tracks_first_last_and_count(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let message_id = Uuid::parse_str(SENT_MESSAGE_ID)?;
    let link_id = Uuid::parse_str(LINK_ID)?;
    let token = Uuid::new_v4();

    set_message_open_tracking_token(&pool, message_id, link_id, token).await?;

    let first_open = record_message_open(&pool, token)
        .await?
        .expect("first open should match the sent message");

    assert_eq!(first_open.message_id, message_id);
    assert_eq!(first_open.link_id, link_id);
    assert_eq!(first_open.open_count, 1);
    assert!(first_open.first_opened_at.is_some());
    assert_eq!(first_open.first_opened_at, first_open.last_opened_at);

    let second_open = record_message_open(&pool, token)
        .await?
        .expect("second open should match the sent message");

    assert_eq!(second_open.open_count, 2);
    assert_eq!(second_open.first_opened_at, first_open.first_opened_at);
    assert!(second_open.last_opened_at >= first_open.last_opened_at);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../fixtures", scripts("message_open_tracking"))
)]
async fn record_message_open_returns_none_for_unknown_token(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let recorded = record_message_open(&pool, Uuid::new_v4()).await?;

    assert!(recorded.is_none());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../fixtures", scripts("message_open_tracking"))
)]
async fn record_message_open_ignores_unsent_messages(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let draft_id = Uuid::parse_str(DRAFT_MESSAGE_ID)?;
    let link_id = Uuid::parse_str(LINK_ID)?;
    let token = Uuid::new_v4();

    set_message_open_tracking_token(&pool, draft_id, link_id, token).await?;

    let recorded = record_message_open(&pool, token).await?;

    assert!(recorded.is_none());

    Ok(())
}
