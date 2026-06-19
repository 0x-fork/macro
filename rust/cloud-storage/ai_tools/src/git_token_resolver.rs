//! GitHub token resolution for coding agents.
//!
//! Bridges Macro's existing GitHub OAuth — which already requests the
//! write-capable `repo` scope — to the coding-agent [`GitTokenResolver`] port,
//! so a spawned agent can clone private repos and push branches / open pull
//! requests using the **spawning user's own** GitHub credentials.
//!
//! The token is the same one Macro stores when a user links their GitHub
//! account (FusionAuth identity-provider link, cached in Redis). No new auth
//! flow is required: the OAuth scope is already `repo user:email`, so the
//! existing linked token is sufficient to push and open PRs.

use std::sync::Arc;

use anyhow::Context;
use async_trait::async_trait;
use coding_agent::domain::models::CodingAgentError;
use coding_agent::domain::ports::GitTokenResolver;
use foreign_entity::{
    domain::service::ForeignEntityServiceImpl,
    outbound::pg_foreign_entity_repo::PgForeignEntityRepo,
};
use github::{
    domain::{
        models::GithubError,
        ports::GithubLinkService,
        service::{GithubLinkConfig, GithubLinkServiceImpl},
    },
    outbound::{
        github_auth_client::GithubAuthImpl, github_oauth_client::GithubOauthImpl,
        pg_github_repo::PgGithubRepo,
    },
};
use macro_env::Environment;
use macro_env_var::maybe_env_var;
use macro_user_id::user_id::MacroUserIdStr;
use secretsmanager_client::{SecretManager, SecretsManager};

/// A [`GitTokenResolver`] backed by Macro's GitHub link service.
///
/// Looks up the user's connected GitHub access token (obtained through Macro's
/// `repo`-scoped OAuth flow) and hands it to the coding agent so it can
/// authenticate clones and pushes on the user's behalf.
pub struct GithubLinkTokenResolver<G> {
    link_service: G,
}

impl<G> GithubLinkTokenResolver<G> {
    /// Wrap a GitHub link service as a coding-agent token resolver.
    pub fn new(link_service: G) -> Self {
        Self { link_service }
    }
}

#[async_trait]
impl<G> GitTokenResolver for GithubLinkTokenResolver<G>
where
    G: GithubLinkService,
{
    #[tracing::instrument(skip(self), err)]
    async fn github_token(&self, user_id: &str) -> Result<Option<String>, CodingAgentError> {
        let macro_user_id = MacroUserIdStr::try_from(user_id.to_owned()).map_err(|e| {
            CodingAgentError::InvalidRequest(format!("invalid macro user id {user_id:?}: {e}"))
        })?;

        match self.link_service.get_access_token(&macro_user_id.0).await {
            Ok(token) => Ok(Some(token.as_str().to_owned())),
            // The user has not connected GitHub — surface an actionable message
            // rather than silently falling back to an unauthenticated clone,
            // which would fail to push or open a PR.
            Err(GithubError::NoLinkFound) => Err(CodingAgentError::Unauthorized(
                "Connect your GitHub account in Macro settings so the coding agent can access the \
                 repository and open pull requests."
                    .to_owned(),
            )),
            Err(GithubError::ReauthenticationRequired) => Err(CodingAgentError::Unauthorized(
                "Your GitHub connection has expired. Reconnect your GitHub account in Macro \
                 settings to let the coding agent push changes."
                    .to_owned(),
            )),
            Err(e) => Err(CodingAgentError::Other(anyhow::Error::new(e))),
        }
    }
}

maybe_env_var! {
    struct GithubResolverEnvVars {
        FusionauthTenantId,
        FusionauthApiKeySecretKey,
        FusionauthBaseUrl,
        GithubClientId,
        GithubClientSecret,
        GithubIdpId,
        // Redis connection. Host services name this differently
        // (`document_cognition_service` uses REDIS_HOST, `mcp_service` uses
        // REDIS_URL, others REDIS_URI); accept whichever is present.
        RedisUrl,
        RedisUri,
        RedisHost,
    }
}

/// Builds a GitHub-backed [`GitTokenResolver`] from environment variables.
///
/// Returns `Ok(None)` when the GitHub/FusionAuth/Redis configuration is not
/// present, in which case coding agents run without a token (public repos
/// only). Required env vars to enable per-user tokens:
/// `FUSIONAUTH_TENANT_ID`, `FUSIONAUTH_API_KEY_SECRET_KEY`,
/// `FUSIONAUTH_BASE_URL`, `GITHUB_IDP_ID`, and a redis connection
/// (`REDIS_URL`, `REDIS_URI`, or `REDIS_HOST`). `GITHUB_CLIENT_ID` /
/// `GITHUB_CLIENT_SECRET` are read when present (only needed for re-linking,
/// not for retrieving an already-stored token).
///
/// The FusionAuth API key env var holds a Secrets Manager secret name in
/// `Develop` / `Production` and a literal value in `Local`.
#[tracing::instrument(skip(pool, secrets), err)]
pub async fn build_git_token_resolver_from_env(
    pool: sqlx::PgPool,
    secrets: &SecretsManager,
    environment: Environment,
) -> anyhow::Result<Option<Arc<dyn GitTokenResolver>>> {
    let vars = GithubResolverEnvVars::new();

    let redis_url = vars
        .redis_url
        .as_ref()
        .and_then(|v| v.value())
        .or_else(|| vars.redis_uri.as_ref().and_then(|v| v.value()))
        .or_else(|| vars.redis_host.as_ref().and_then(|v| v.value()));

    let (Some(tenant_id), Some(api_key_secret), Some(base_url), Some(idp_id), Some(redis_url)) = (
        vars.fusionauth_tenant_id.as_ref().and_then(|v| v.value()),
        vars.fusionauth_api_key_secret_key
            .as_ref()
            .and_then(|v| v.value()),
        vars.fusionauth_base_url.as_ref().and_then(|v| v.value()),
        vars.github_idp_id.as_ref().and_then(|v| v.value()),
        redis_url,
    ) else {
        tracing::info!(
            "GitHub token resolver not configured (missing FusionAuth/GitHub/Redis env); \
             coding agents are limited to public repositories"
        );
        return Ok(None);
    };

    let api_key = secrets
        .get_maybe_secret_value(environment, api_key_secret)
        .await
        .context("failed to load FusionAuth API key for GitHub token resolver")?
        .as_ref()
        .to_owned();

    let client_id = vars
        .github_client_id
        .as_ref()
        .and_then(|v| v.value())
        .unwrap_or_default()
        .to_owned();
    let client_secret = vars
        .github_client_secret
        .as_ref()
        .and_then(|v| v.value())
        .unwrap_or_default()
        .to_owned();

    // Only the tenant id, API key and base url are exercised when retrieving an
    // existing link's token; the remaining FusionAuth/Google fields are unused
    // here and left empty.
    let fusionauth_client = fusionauth::FusionAuthClient::new(
        tenant_id.to_owned(),
        api_key,
        String::new(),
        String::new(),
        base_url.to_owned(),
        String::new(),
        String::new(),
        String::new(),
    );

    let redis_client = redis::Client::open(redis_url.to_owned())
        .context("failed to open redis client for GitHub token resolver")?;
    let redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .context("failed to connect to redis for GitHub token resolver")?;

    let link_service = GithubLinkServiceImpl::new(
        PgGithubRepo::new(pool.clone()),
        GithubOauthImpl::default(),
        GithubAuthImpl::new(fusionauth_client, redis_conn),
        ForeignEntityServiceImpl::new(PgForeignEntityRepo::new(pool)),
        GithubLinkConfig {
            client_id,
            client_secret,
            idp_id: idp_id.to_owned(),
        },
    );

    tracing::info!("GitHub token resolver configured for coding agents");
    Ok(Some(Arc::new(GithubLinkTokenResolver::new(link_service))))
}

#[cfg(test)]
mod test;
