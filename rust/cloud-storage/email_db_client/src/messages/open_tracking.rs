//! Read-receipt (open) tracking for sent messages.
//!
//! At send time a unique token is stored on the outgoing message and embedded
//! in a tracking pixel URL inside the message HTML. When the pixel is fetched
//! the open is recorded here, keyed by that token.

#[cfg(test)]
mod test;

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use sqlx::types::Uuid;

/// The state of a message's open tracking after recording an open.
#[derive(Debug, Clone)]
pub struct RecordedMessageOpen {
    pub message_id: Uuid,
    pub link_id: Uuid,
    pub thread_id: Uuid,
    pub first_opened_at: Option<DateTime<Utc>>,
    pub last_opened_at: Option<DateTime<Utc>>,
    pub open_count: i32,
}

/// Assigns the open tracking token embedded in an outgoing message's tracking
/// pixel. Called at send time, right before the message is handed to the
/// provider.
#[tracing::instrument(skip(pool), err)]
pub async fn set_message_open_tracking_token(
    pool: &PgPool,
    message_id: Uuid,
    link_id: Uuid,
    token: Uuid,
) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
        UPDATE email_messages
        SET open_tracking_token = $3
        WHERE id = $1 AND link_id = $2
        "#,
        message_id,
        link_id,
        token,
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Records an open for the sent message matching a tracking token. Returns
/// `None` when the token doesn't match any sent message.
#[tracing::instrument(skip(pool), err)]
pub async fn record_message_open(
    pool: &PgPool,
    token: Uuid,
) -> anyhow::Result<Option<RecordedMessageOpen>> {
    let recorded = sqlx::query_as!(
        RecordedMessageOpen,
        r#"
        UPDATE email_messages
        SET first_opened_at = COALESCE(first_opened_at, NOW()),
            last_opened_at = NOW(),
            open_count = open_count + 1
        WHERE open_tracking_token = $1 AND is_sent = true
        RETURNING
            id as message_id,
            link_id,
            thread_id,
            first_opened_at,
            last_opened_at,
            open_count
        "#,
        token,
    )
    .fetch_optional(pool)
    .await?;

    Ok(recorded)
}
