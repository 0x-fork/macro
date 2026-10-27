//! Query for whatsapp_group access level.

use crate::{domain::models::AccessLevel, outbound::pg_access_repo::queries::SourceIds};
use sqlx::PgPool;

/// Highest access level the caller's `source_ids` reach on a WhatsApp chat
/// (whatsapp_group), from the database's one implementation of the rule
/// (`whatsapp_group_access_level`, also behind `whatsapp_group_can_view` and
/// the attachment branch of `document_access`).
#[tracing::instrument(err, skip(pool, source_ids))]
pub async fn get_whatsapp_group_access(
    pool: &PgPool,
    whatsapp_group_id: &uuid::Uuid,
    source_ids: &SourceIds,
) -> Result<Option<AccessLevel>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT whatsapp_group_access_level($1, $2) AS "access_level?: AccessLevel""#,
        whatsapp_group_id,
        &source_ids.0,
    )
    .fetch_one(pool)
    .await
}
