//! Query resolving the parent entity of a message thread.

use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::MessageThreadParent;

/// Resolve the polymorphic `(parent_type, parent_id)` pair of a
/// `comms_messages` row. Legacy rows predating the parent columns are
/// channel-parented (`COALESCE` matches the expression indexes added by the
/// `message_parent_entity` migration).
#[tracing::instrument(err, skip(pool))]
pub async fn get_message_thread_parent(
    pool: &PgPool,
    message_id: &Uuid,
) -> Result<Option<MessageThreadParent>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT
            COALESCE(parent_type, 'channel') AS "entity_type!",
            COALESCE(parent_id, channel_id::text) AS "entity_id!"
        FROM comms_messages
        WHERE id = $1
        "#,
        message_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| MessageThreadParent {
        entity_type: r.entity_type,
        entity_id: r.entity_id,
    }))
}
