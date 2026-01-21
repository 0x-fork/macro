//! Foreign entity access queries.
//!
//! Foreign entities have no access control - if they exist, everyone has View access.

use sqlx::PgPool;
use uuid::Uuid;

/// Check if a foreign entity exists.
///
/// Foreign entities have no ownership or access control.
/// If an entity exists, all users have View access to it.
#[tracing::instrument(skip(pool), err)]
pub async fn check_foreign_entity_exists(
    pool: &PgPool,
    entity_id: &str,
) -> Result<bool, sqlx::Error> {
    // Parse entity_id as UUID
    let entity_uuid = match Uuid::parse_str(entity_id) {
        Ok(uuid) => uuid,
        Err(_) => return Ok(false), // Invalid UUID means entity doesn't exist
    };

    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM foreign_entities
            WHERE id = $1
        ) as "exists!"
        "#,
        entity_uuid
    )
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

#[cfg(test)]
mod test;
