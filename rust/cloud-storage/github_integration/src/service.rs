use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::GitHubConfig,
    db,
    error::{GitHubIntegrationError, Result},
    models::{GitHubCredentialsResponse, GitHubRepository, GitHubUserInfo},
    oauth_client::GitHubOAuthClient,
};

/// Trait for FusionAuth identity provider linking operations
///
/// This trait abstracts the FusionAuth operations needed for GitHub integration.
/// The authentication_service will implement this trait for its FusionAuthClient.
#[async_trait::async_trait]
pub trait FusionAuthLinking: Send + Sync {
    /// Links a user to a GitHub identity provider
    async fn link_user(
        &self,
        user_id: &str,
        identity_provider_id: &str,
        identity_provider_user_id: &str,
        display_name: &str,
        token: &str,
    ) -> anyhow::Result<()>;

    /// Unlinks a user from a GitHub identity provider
    async fn unlink_user(
        &self,
        user_id: &str,
        identity_provider_id: &str,
        identity_provider_user_id: &str,
    ) -> anyhow::Result<()>;

    /// Retrieves links for a user
    async fn get_links(
        &self,
        user_id: &str,
        identity_provider_id: Option<&str>,
    ) -> anyhow::Result<Vec<IdentityProviderLink>>;
}

/// Identity provider link information returned from FusionAuth
#[derive(Debug, Clone)]
pub struct IdentityProviderLink {
    pub display_name: String,
    pub identity_provider_id: String,
    pub identity_provider_user_id: String,
    pub token: String,
    pub user_id: String,
}

/// Links a GitHub account to a Macro user
///
/// This orchestrates the complete flow:
/// 1. Exchange OAuth code for tokens
/// 2. Get GitHub user info
/// 3. Check for account conflicts
/// 4. Link in FusionAuth
/// 5. Store in database
#[tracing::instrument(
    skip(pool, fusionauth_client, oauth_client, config, code),
    fields(fusionauth_user_id=%fusionauth_user_id),
    err
)]
pub async fn link_github_account<F>(
    pool: &PgPool,
    fusionauth_client: &F,
    oauth_client: &GitHubOAuthClient,
    config: &GitHubConfig,
    redirect_uri: &str,
    code: &str,
    fusionauth_user_id: Uuid,
) -> Result<GitHubUserInfo>
where
    F: FusionAuthLinking,
{
    tracing::info!("linking GitHub account");

    // Exchange code for access token
    let token_response = oauth_client
        .exchange_code_for_tokens(config, redirect_uri, code)
        .await?;

    // Get GitHub user info
    let user_info = oauth_client
        .get_user_info(&token_response.access_token)
        .await?;

    // Check if GitHub account is already linked to a different user
    let existing_link = db::get_link_by_github_user_id(pool, &user_info.id.to_string()).await?;

    if let Some(existing) = existing_link {
        if existing.fusionauth_user_id != fusionauth_user_id {
            return Err(GitHubIntegrationError::AccountAlreadyLinked);
        }
    }

    // Link in FusionAuth
    fusionauth_client
        .link_user(
            &fusionauth_user_id.to_string(),
            &config.idp_id,
            &user_info.id.to_string(),
            &user_info.login,
            &token_response.access_token,
        )
        .await
        .map_err(|e| GitHubIntegrationError::FusionAuthLinkingFailed(e.to_string()))?;

    // Create github_links record
    let link = db::GitHubLink {
        id: macro_uuid::generate_uuid_v7(),
        macro_id: fusionauth_user_id.to_string(),
        fusionauth_user_id,
        github_username: user_info.login.clone(),
        github_user_id: user_info.id.to_string(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    tracing::info!(
        fusionauth_user_id=%fusionauth_user_id,
        github_user_id=%user_info.id,
        github_username=%user_info.login,
        "creating github_links record"
    );

    db::create_github_link(pool, link)
        .await
        .inspect_err(|e| {
            tracing::error!(error=?e, "failed to create github_links record");

            // Note: Cleanup of FusionAuth link should be handled by caller
            // if they want to implement async cleanup on failure
        })?;

    tracing::info!("successfully linked GitHub account");

    Ok(user_info)
}

/// Unlinks a GitHub account from a Macro user
#[tracing::instrument(
    skip(pool, fusionauth_client, config),
    fields(fusionauth_user_id=%fusionauth_user_id),
    err
)]
pub async fn unlink_github_account<F>(
    pool: &PgPool,
    fusionauth_client: &F,
    config: &GitHubConfig,
    fusionauth_user_id: Uuid,
) -> Result<()>
where
    F: FusionAuthLinking,
{
    tracing::info!("unlinking GitHub account");

    // Get existing link
    let link = db::get_link_by_fusionauth_user_id(pool, fusionauth_user_id)
        .await?
        .ok_or(GitHubIntegrationError::NotLinked)?;

    // Unlink from FusionAuth
    fusionauth_client
        .unlink_user(
            &fusionauth_user_id.to_string(),
            &config.idp_id,
            &link.github_user_id,
        )
        .await
        .map_err(|e| GitHubIntegrationError::FusionAuthUnlinkingFailed(e.to_string()))?;

    // Delete database record
    db::delete_link_by_fusionauth_user_id(pool, fusionauth_user_id).await?;

    tracing::info!("successfully unlinked GitHub account");

    Ok(())
}

/// Retrieves GitHub credentials for a user
#[tracing::instrument(
    skip(pool, fusionauth_client, config),
    fields(fusionauth_user_id=%fusionauth_user_id),
    err
)]
pub async fn get_github_credentials<F>(
    pool: &PgPool,
    fusionauth_client: &F,
    config: &GitHubConfig,
    fusionauth_user_id: Uuid,
) -> Result<GitHubCredentialsResponse>
where
    F: FusionAuthLinking,
{
    tracing::info!("retrieving GitHub credentials");

    // Get github_links record
    let link = db::get_link_by_fusionauth_user_id(pool, fusionauth_user_id)
        .await?
        .ok_or(GitHubIntegrationError::NotLinked)?;

    // Get identity provider links from FusionAuth
    let idp_links = fusionauth_client
        .get_links(&fusionauth_user_id.to_string(), Some(&config.idp_id))
        .await
        .map_err(|e| GitHubIntegrationError::Generic(e))?;

    // Find matching link
    let idp_link = idp_links
        .into_iter()
        .find(|l| l.identity_provider_user_id == link.github_user_id)
        .ok_or_else(|| {
            GitHubIntegrationError::Generic(anyhow::anyhow!("GitHub link not found in FusionAuth"))
        })?;

    Ok(GitHubCredentialsResponse {
        access_token: idp_link.token,
        github_username: link.github_username,
        github_user_id: link.github_user_id,
    })
}

/// Retrieves GitHub repositories for a user
#[tracing::instrument(
    skip(pool, fusionauth_client, oauth_client, config),
    fields(fusionauth_user_id=%fusionauth_user_id),
    err
)]
pub async fn get_user_repositories<F>(
    pool: &PgPool,
    fusionauth_client: &F,
    oauth_client: &GitHubOAuthClient,
    config: &GitHubConfig,
    fusionauth_user_id: Uuid,
    per_page: Option<u8>,
) -> Result<Vec<GitHubRepository>>
where
    F: FusionAuthLinking,
{
    tracing::info!("retrieving GitHub repositories");

    // Get credentials
    let credentials = get_github_credentials(
        pool,
        fusionauth_client,
        config,
        fusionauth_user_id,
    )
    .await?;

    // Fetch repositories
    oauth_client
        .list_user_repositories(&credentials.access_token, per_page, Some("updated"))
        .await
}

/// Retrieves a specific GitHub repository for a user
#[tracing::instrument(
    skip(pool, fusionauth_client, oauth_client, config),
    fields(fusionauth_user_id=%fusionauth_user_id, owner=%owner, repo=%repo),
    err
)]
pub async fn get_user_repository<F>(
    pool: &PgPool,
    fusionauth_client: &F,
    oauth_client: &GitHubOAuthClient,
    config: &GitHubConfig,
    fusionauth_user_id: Uuid,
    owner: &str,
    repo: &str,
) -> Result<GitHubRepository>
where
    F: FusionAuthLinking,
{
    tracing::info!("retrieving GitHub repository");

    // Get credentials
    let credentials = get_github_credentials(
        pool,
        fusionauth_client,
        config,
        fusionauth_user_id,
    )
    .await?;

    // Fetch the specific repository
    oauth_client
        .get_repository(&credentials.access_token, owner, repo)
        .await
}
