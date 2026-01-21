//! Database operations for foreign entities
//!
//! Foreign entities represent references to external system entities using namespaced identifiers.

use model_entity::NamespacedIdentifier;
use sqlx::{Pool, Postgres};
use uuid::Uuid;

/// Represents a foreign entity stored in the database
#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct ForeignEntity {
    /// Unique identifier
    pub id: Uuid,
    /// The full namespaced identifier
    #[sqlx(rename = "namespacedIdentifier")]
    pub namespaced_identifier: String,
    /// The path segments
    pub path: Vec<String>,
    /// The identifier portion
    pub identifier: String,
    /// Creation timestamp
    #[sqlx(rename = "createdAt")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Last update timestamp
    #[sqlx(rename = "updatedAt")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl ForeignEntity {
    /// Convert the stored components back into a NamespacedIdentifier
    pub fn to_namespaced_identifier(&self) -> Result<NamespacedIdentifier, anyhow::Error> {
        NamespacedIdentifier::new(self.path.clone(), self.identifier.clone())
            .map_err(|e| anyhow::anyhow!("Invalid namespaced identifier in database: {}", e))
    }
}

/// Get a foreign entity by its UUID
#[tracing::instrument(skip(db), err)]
pub async fn get_by_id(
    db: &Pool<Postgres>,
    id: Uuid,
) -> anyhow::Result<Option<ForeignEntity>> {
    let result = sqlx::query_as!(
        ForeignEntity,
        r#"
        SELECT
            id,
            "namespacedIdentifier" as "namespaced_identifier",
            path,
            identifier,
            "createdAt" as "created_at",
            "updatedAt" as "updated_at"
        FROM foreign_entities
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(db)
    .await?;

    Ok(result)
}

/// Get a foreign entity by its namespaced identifier
#[tracing::instrument(skip(db), err)]
pub async fn get_by_namespaced_identifier(
    db: &Pool<Postgres>,
    ns_id: &NamespacedIdentifier,
) -> anyhow::Result<Option<ForeignEntity>> {
    let ns_id_str = ns_id.to_string();

    let result = sqlx::query_as!(
        ForeignEntity,
        r#"
        SELECT
            id,
            "namespacedIdentifier" as "namespaced_identifier",
            path,
            identifier,
            "createdAt" as "created_at",
            "updatedAt" as "updated_at"
        FROM foreign_entities
        WHERE "namespacedIdentifier" = $1
        "#,
        ns_id_str
    )
    .fetch_optional(db)
    .await?;

    Ok(result)
}

/// Get or create a foreign entity (idempotent operation)
///
/// If the foreign entity already exists, returns the existing one.
/// Otherwise, creates a new one.
#[tracing::instrument(skip(db), err)]
pub async fn get_or_create(
    db: &Pool<Postgres>,
    ns_id: NamespacedIdentifier,
) -> anyhow::Result<ForeignEntity> {
    let ns_id_str = ns_id.to_string();
    let (path, identifier) = ns_id.into_parts();

    let result = sqlx::query_as!(
        ForeignEntity,
        r#"
        INSERT INTO foreign_entities (
            "namespacedIdentifier",
            path,
            identifier
        )
        VALUES ($1, $2, $3)
        ON CONFLICT ("namespacedIdentifier") DO NOTHING
        RETURNING
            id,
            "namespacedIdentifier" as "namespaced_identifier",
            path,
            identifier,
            "createdAt" as "created_at",
            "updatedAt" as "updated_at"
        "#,
        ns_id_str,
        &path,
        identifier
    )
    .fetch_one(db)
    .await;

    // If conflict occurred, fetch the existing record
    match result {
        Ok(entity) => Ok(entity),
        Err(sqlx::Error::RowNotFound) => {
            // The INSERT was skipped due to conflict, fetch the existing record
            get_by_namespaced_identifier(db, &NamespacedIdentifier::new(path, identifier)?)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Foreign entity should exist after conflict"))
        }
        Err(e) => Err(e.into()),
    }
}

/// List foreign entities by path prefix
///
/// For example, to get all Discord entities, pass `["discord"]`.
/// To get all Discord channel entities, pass `["discord", "channel"]`.
#[tracing::instrument(skip(db), err)]
pub async fn list_by_path_prefix(
    db: &Pool<Postgres>,
    prefix: &[String],
) -> anyhow::Result<Vec<ForeignEntity>> {
    let prefix_len = prefix.len() as i32;

    let results = sqlx::query_as!(
        ForeignEntity,
        r#"
        SELECT
            id,
            "namespacedIdentifier" as "namespaced_identifier",
            path,
            identifier,
            "createdAt" as "created_at",
            "updatedAt" as "updated_at"
        FROM foreign_entities
        WHERE path[1:$1] = $2
        ORDER BY "createdAt" DESC
        "#,
        prefix_len,
        prefix
    )
    .fetch_all(db)
    .await?;

    Ok(results)
}

/// Delete a foreign entity by its UUID
#[tracing::instrument(skip(db), err)]
pub async fn delete(db: &Pool<Postgres>, id: Uuid) -> anyhow::Result<bool> {
    let result = sqlx::query!(
        r#"
        DELETE FROM foreign_entities
        WHERE id = $1
        "#,
        id
    )
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod test;
