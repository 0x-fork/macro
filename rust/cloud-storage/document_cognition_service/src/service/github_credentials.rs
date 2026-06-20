//! Adapts macro's existing GitHub integration ([`GithubLinkService`]) to the
//! `coding_agent` credential + repository-listing ports, so the coding agent
//! uses the **per-user** GitHub token (resolved via FusionAuth/Redis) for
//! clone/push/PR and lists the user's own repositories in the dropdown.
//!
//! `GithubLinkService` is not dyn-compatible (RPITIT + a generic method), so
//! the adapters are generic over the concrete service type and only the
//! object-safe `coding_agent` ports are boxed as `dyn`.

use std::sync::Arc;

use anyhow::Context;
use async_trait::async_trait;
use coding_agent::{CodingError, GitCredentialProvider, GitCredentials, RepoRef, RepositoryLister};
use fusionauth::FusionAuthClient;
use github::domain::models::{GithubError, GithubRepository};
use github::domain::ports::GithubLinkService;
use github::domain::service::{GithubLinkConfig, GithubLinkServiceImpl};
use github::outbound::github_auth_client::GithubAuthImpl;
use github::outbound::github_oauth_client::GithubOauthImpl;
use github::outbound::pg_github_repo::PgGithubRepo;
use macro_user_id::user_id::MacroUserIdStr;
use secretsmanager_client::{SecretManager, SecretsManager};
use sqlx::PgPool;

/// The concrete `GithubLinkService` as wired in DCS.
pub type DcsGithubLinkService = GithubLinkServiceImpl<
    PgGithubRepo,
    GithubOauthImpl,
    GithubAuthImpl,
    foreign_entity::domain::service::ForeignEntityServiceImpl<
        foreign_entity::outbound::pg_foreign_entity_repo::PgForeignEntityRepo,
    >,
>;

/// Build the GitHub link service from environment configuration.
///
/// Returns `Ok(None)` when the GitHub integration env vars are absent so the
/// caller can fall back to a local/dev credential source. Only the
/// token-*read* path is exercised here, so FusionAuth OAuth/client fields that
/// are only needed for the linking flow are left empty.
///
/// Required env: `FUSION_AUTH_TENANT_ID`, `FUSION_AUTH_BASE_URL`,
/// `FUSION_AUTH_API_SECRET_KEY` (a Secrets Manager key outside Local), and
/// `GITHUB_IDP_ID`.
#[tracing::instrument(skip(db, redis_client, secrets), err)]
pub async fn build_dcs_github_link_service(
    db: &PgPool,
    redis_client: &redis::Client,
    secrets: &SecretsManager,
    is_local: bool,
) -> anyhow::Result<Option<DcsGithubLinkService>> {
    let (Ok(tenant_id), Ok(base_url), Ok(idp_id), Ok(api_key_ref)) = (
        std::env::var("FUSION_AUTH_TENANT_ID"),
        std::env::var("FUSION_AUTH_BASE_URL"),
        std::env::var("GITHUB_IDP_ID"),
        std::env::var("FUSION_AUTH_API_SECRET_KEY"),
    ) else {
        tracing::info!(
            "GitHub integration env not configured; coding agent falls back to GITHUB_TOKEN"
        );
        return Ok(None);
    };
    if [&tenant_id, &base_url, &idp_id, &api_key_ref]
        .iter()
        .any(|v| v.is_empty())
    {
        return Ok(None);
    }

    let api_key = if is_local {
        api_key_ref
    } else {
        secrets
            .get_secret_value(&api_key_ref)
            .await
            .context("failed to resolve FusionAuth API key from secrets manager")?
            .to_string()
    };

    // Only the token-read path (FusionAuth `get_links`) is used; the OAuth
    // client/redirect and Google fields are irrelevant here.
    let fusion_auth_client = FusionAuthClient::new(
        tenant_id,
        api_key,
        String::new(),
        String::new(),
        base_url,
        String::new(),
        String::new(),
        String::new(),
    );

    let redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .context("failed to get multiplexed redis connection for github auth")?;

    let service = GithubLinkServiceImpl::new(
        PgGithubRepo::new(db.clone()),
        GithubOauthImpl::default(),
        GithubAuthImpl::new(fusion_auth_client, redis_conn),
        foreign_entity::domain::service::ForeignEntityServiceImpl::new(
            foreign_entity::outbound::pg_foreign_entity_repo::PgForeignEntityRepo::new(db.clone()),
        ),
        GithubLinkConfig {
            client_id: String::new(),
            client_secret: String::new(),
            idp_id,
        },
    );

    Ok(Some(service))
}

fn parse_user(user_id: &str) -> Result<MacroUserIdStr<'static>, CodingError> {
    MacroUserIdStr::try_from(user_id.to_string())
        .map_err(|e| CodingError::Other(anyhow::anyhow!("invalid macro user id: {e:?}")))
}

fn map_github_err(user_id: &str, e: GithubError) -> CodingError {
    match e {
        GithubError::NoLinkFound | GithubError::ReauthenticationRequired => {
            CodingError::MissingCredentials {
                user_id: user_id.to_string(),
            }
        }
        other => CodingError::Other(anyhow::anyhow!("github integration error: {other}")),
    }
}

/// [`GitCredentialProvider`] backed by the per-user GitHub token.
pub struct GithubLinkCredentialProvider<S> {
    service: Arc<S>,
}

impl<S> GithubLinkCredentialProvider<S> {
    /// Wrap a github link service.
    pub fn new(service: Arc<S>) -> Self {
        Self { service }
    }
}

#[async_trait]
impl<S: GithubLinkService> GitCredentialProvider for GithubLinkCredentialProvider<S> {
    async fn credentials_for(
        &self,
        user_id: &str,
        _repo: &RepoRef,
    ) -> coding_agent::Result<GitCredentials> {
        let parsed = parse_user(user_id)?;
        let token = self
            .service
            .get_user_access_token(&parsed.0)
            .await
            .map_err(|e| map_github_err(user_id, e))?;
        Ok(GitCredentials {
            // GitHub accepts the token as the password with any username; the
            // conventional sentinel keeps it out of logs/URLs as a real login.
            username: "x-access-token".to_string(),
            token: token.as_str().to_string(),
        })
    }
}

/// [`RepositoryLister`] backed by the user's GitHub repositories.
pub struct GithubLinkRepoLister<S> {
    service: Arc<S>,
}

impl<S> GithubLinkRepoLister<S> {
    /// Wrap a github link service.
    pub fn new(service: Arc<S>) -> Self {
        Self { service }
    }
}

#[async_trait]
impl<S: GithubLinkService> RepositoryLister for GithubLinkRepoLister<S> {
    async fn list_for_user(&self, user_id: &str) -> coding_agent::Result<Vec<RepoRef>> {
        let parsed = parse_user(user_id)?;
        let repos = self
            .service
            .list_user_repositories(&parsed.0)
            .await
            .map_err(|e| map_github_err(user_id, e))?;
        Ok(repos
            .into_iter()
            .map(|r: GithubRepository| RepoRef {
                owner: r.owner,
                name: r.name,
                default_branch: r.default_branch,
            })
            .collect())
    }
}
