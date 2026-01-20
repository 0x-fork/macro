use sqlx::PgPool;
use uuid::Uuid;

// Re-export from models
pub use crate::models::GitHubLink;

/// Fetches a GitHub link by FusionAuth user ID.
/// Returns None if no link exists for the user.
#[tracing::instrument(skip(pool), err)]
pub async fn get_link_by_fusionauth_user_id(
    pool: &PgPool,
    fusionauth_user_id: Uuid,
) -> anyhow::Result<Option<GitHubLink>> {
    let link = sqlx::query_as!(
        GitHubLink,
        r#"
        SELECT id, macro_id, fusionauth_user_id as "fusionauth_user_id: Uuid", github_username, github_user_id, created_at, updated_at
        FROM github_links
        WHERE fusionauth_user_id = $1
        "#,
        fusionauth_user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(link)
}

/// Fetches a GitHub link by its ID.
/// Returns None if no link with the given ID exists.
#[tracing::instrument(skip(pool), err)]
pub async fn get_link_by_id(pool: &PgPool, link_id: Uuid) -> anyhow::Result<Option<GitHubLink>> {
    let link = sqlx::query_as!(
        GitHubLink,
        r#"
        SELECT id, macro_id, fusionauth_user_id, github_username, github_user_id, created_at, updated_at
        FROM github_links
        WHERE id = $1
        "#,
        link_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(link)
}

/// Fetches a GitHub link by GitHub user ID.
/// Returns None if no link exists for the GitHub user.
#[tracing::instrument(skip(pool), err)]
pub async fn get_link_by_github_user_id(
    pool: &PgPool,
    github_user_id: &str,
) -> anyhow::Result<Option<GitHubLink>> {
    let link = sqlx::query_as!(
        GitHubLink,
        r#"
        SELECT id, macro_id, fusionauth_user_id, github_username, github_user_id, created_at, updated_at
        FROM github_links
        WHERE github_user_id = $1
        "#,
        github_user_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(link)
}
