use sqlx::PgPool;
use uuid::Uuid;

/// Deletes a GitHub link by its ID.
/// Returns the number of rows affected (should be 1 if successful, 0 if the link didn't exist).
#[tracing::instrument(skip(pool), level = "error")]
pub async fn delete_link_by_id(pool: &PgPool, link_id: Uuid) -> anyhow::Result<u64> {
    let result = sqlx::query!(
        r#"
        DELETE FROM github_links
        WHERE id = $1
        "#,
        link_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// Deletes a GitHub link by FusionAuth user ID.
/// Returns the number of rows affected (should be 1 if successful, 0 if the link didn't exist).
#[tracing::instrument(skip(pool), level = "error")]
pub async fn delete_link_by_fusionauth_user_id(
    pool: &PgPool,
    fusionauth_user_id: Uuid,
) -> anyhow::Result<u64> {
    let result = sqlx::query!(
        r#"
        DELETE FROM github_links
        WHERE fusionauth_user_id = $1::uuid
        "#,
        fusionauth_user_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}
