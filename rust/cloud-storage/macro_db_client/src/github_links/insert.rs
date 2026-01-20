use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

/// Represents a GitHub link record to be inserted
#[derive(Debug, Clone)]
pub struct GitHubLink {
    pub id: Uuid,
    pub macro_id: String,
    pub fusionauth_user_id: Uuid,
    pub github_username: String,
    pub github_user_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Creates a new GitHub link record in the database.
/// Returns an error if the user already has a GitHub link or if the GitHub account
/// is already linked to another user (enforced by unique constraints).
#[tracing::instrument(skip(pool), err)]
pub async fn create_github_link(
    pool: &PgPool,
    link: GitHubLink,
) -> anyhow::Result<GitHubLink> {
    tracing::info!(
        "executing INSERT query for github_links"
    );

    let result = sqlx::query!(
        r#"
        INSERT INTO github_links (id, macro_id, fusionauth_user_id, github_username, github_user_id, created_at, updated_at)
        VALUES ($1, $2, $3::uuid, $4, $5, $6, $7)
        "#,
        link.id,
        link.macro_id,
        link.fusionauth_user_id,
        link.github_username,
        link.github_user_id,
        link.created_at,
        link.updated_at,
    )
    .execute(pool)
    .await;

    match result {
        Ok(query_result) => {
            tracing::trace!(
                rows_affected=%query_result.rows_affected(),
                "github_links INSERT query succeeded"
            );
            Ok(link)
        }
        Err(e) => {
            tracing::error!(error=?e, "github_links INSERT query failed");
            anyhow::bail!("github_links INSERT query failed: {}", e);
        }
    }
}
