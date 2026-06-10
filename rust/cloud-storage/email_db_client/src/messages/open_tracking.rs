//! Read-receipt (open) tracking for sent messages.
//!
//! At send time a unique token is stored on the outgoing message and embedded
//! in a tracking pixel URL inside the message HTML. Opens are recorded by the
//! email service's public pixel endpoint (see the `email` crate's
//! `open_tracking_router`), keyed by that token.

#[cfg(test)]
mod test;

use sqlx::PgPool;
use sqlx::types::Uuid;

/// Assigns the open tracking token embedded in an outgoing message's tracking
/// pixel. Called at send time, right before the message is handed to the
/// provider. Errors if the message doesn't exist for `(message_id, link_id)`,
/// so the caller never injects a pixel whose token wasn't persisted.
#[tracing::instrument(skip(pool), err)]
pub async fn set_message_open_tracking_token(
    pool: &PgPool,
    message_id: Uuid,
    link_id: Uuid,
    token: Uuid,
) -> anyhow::Result<()> {
    let result = sqlx::query!(
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

    if result.rows_affected() != 1 {
        anyhow::bail!(
            "expected to set open tracking token on exactly one message, but {} rows matched (message_id={}, link_id={})",
            result.rows_affected(),
            message_id,
            link_id
        );
    }

    Ok(())
}
