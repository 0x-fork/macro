#[cfg(test)]
mod test;

use models_email::{db, service};
use sqlx::PgPool;
use sqlx::types::Uuid;

/// Applies a partial update to a link's settings. `None` fields keep their
/// current value (or the column default when the row is first created).
#[tracing::instrument(skip(pool), err)]
pub async fn patch_settings(
    pool: &PgPool,
    settings_patch: service::settings::SettingsPatch,
) -> anyhow::Result<service::settings::Settings> {
    let result = sqlx::query_as!(
        db::settings::Settings,
        r#"
        INSERT INTO email_settings (link_id, signature_on_replies_forwards, read_receipts_enabled)
        VALUES ($1, COALESCE($2, false), COALESCE($3, true))
        ON CONFLICT (link_id)
        DO UPDATE SET
            signature_on_replies_forwards = COALESCE($2, email_settings.signature_on_replies_forwards),
            read_receipts_enabled = COALESCE($3, email_settings.read_receipts_enabled),
            updated_at = NOW()
        RETURNING link_id, signature_on_replies_forwards, read_receipts_enabled
        "#,
        settings_patch.link_id,
        settings_patch.signature_on_replies_forwards,
        settings_patch.read_receipts_enabled,
    )
    .fetch_one(pool)
    .await?;

    Ok(service::settings::Settings::from(result))
}

/// Fetches a user's settings by link ID.
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_settings(
    pool: &PgPool,
    link_id: Uuid,
) -> anyhow::Result<service::settings::Settings> {
    let result = sqlx::query_as!(
        db::settings::Settings,
        r#"
        SELECT link_id, signature_on_replies_forwards, read_receipts_enabled
        FROM email_settings
        WHERE link_id = $1
        "#,
        link_id
    )
    .fetch_one(pool)
    .await?;

    Ok(service::settings::Settings::from(result))
}

/// Returns whether read receipts (open tracking on outgoing mail) are enabled
/// for a link. Links without a settings row fall back to the default (enabled).
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_read_receipts_enabled(pool: &PgPool, link_id: Uuid) -> anyhow::Result<bool> {
    let enabled = sqlx::query_scalar!(
        r#"
        SELECT read_receipts_enabled
        FROM email_settings
        WHERE link_id = $1
        "#,
        link_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(enabled.unwrap_or(true))
}
