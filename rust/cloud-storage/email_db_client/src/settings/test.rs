use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use models_email::service::settings::SettingsPatch;
use sqlx::{Pool, Postgres};

const LINK_WITH_SETTINGS: &str = "00000000-0000-0000-0000-000000000a01";
const LINK_WITHOUT_SETTINGS: &str = "00000000-0000-0000-0000-000000000a02";

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../fixtures", scripts("email_settings"))
)]
async fn read_receipts_default_to_enabled(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let with_settings = Uuid::parse_str(LINK_WITH_SETTINGS)?;
    let without_settings = Uuid::parse_str(LINK_WITHOUT_SETTINGS)?;

    assert!(fetch_read_receipts_enabled(&pool, with_settings).await?);
    assert!(fetch_read_receipts_enabled(&pool, without_settings).await?);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../fixtures", scripts("email_settings"))
)]
async fn patch_settings_only_updates_provided_fields(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link_id = Uuid::parse_str(LINK_WITH_SETTINGS)?;

    // Disable read receipts without touching the signature setting.
    let updated = patch_settings(
        &pool,
        SettingsPatch {
            link_id,
            signature_on_replies_forwards: None,
            read_receipts_enabled: Some(false),
        },
    )
    .await?;

    assert!(updated.signature_on_replies_forwards);
    assert!(!updated.read_receipts_enabled);
    assert!(!fetch_read_receipts_enabled(&pool, link_id).await?);

    // And the reverse: patching the signature leaves read receipts disabled.
    let updated = patch_settings(
        &pool,
        SettingsPatch {
            link_id,
            signature_on_replies_forwards: Some(false),
            read_receipts_enabled: None,
        },
    )
    .await?;

    assert!(!updated.signature_on_replies_forwards);
    assert!(!updated.read_receipts_enabled);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../fixtures", scripts("email_settings"))
)]
async fn patch_settings_creates_row_with_defaults(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link_id = Uuid::parse_str(LINK_WITHOUT_SETTINGS)?;

    let created = patch_settings(
        &pool,
        SettingsPatch {
            link_id,
            signature_on_replies_forwards: None,
            read_receipts_enabled: Some(true),
        },
    )
    .await?;

    assert!(!created.signature_on_replies_forwards);
    assert!(created.read_receipts_enabled);

    Ok(())
}
