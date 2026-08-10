use crate::domain::models::{NangoConnectSession, NangoConnection, NangoEndUser};
use crate::domain::ports::NangoConnectService;
use anyhow::Context;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a token fetched from Nango is served from cache when the
/// connection reports no expiry of its own.
const DEFAULT_TOKEN_TTL: Duration = Duration::from_secs(5 * 60);

/// Safety margin subtracted from a token's reported lifetime, so we never
/// hand out a token about to expire mid-session.
const TOKEN_EXPIRY_MARGIN: Duration = Duration::from_secs(60);

/// Configuration for [`NangoClient`].
#[derive(Clone, Debug)]
pub struct NangoConfig {
    /// Secret key for the Nango environment (`Authorization: Bearer ...`).
    pub secret_key: String,
    /// Base URL of the Nango API. `https://api.nango.dev` unless self-hosted.
    pub base_url: String,
    /// The integration ID (provider config key) of the MCP integration to
    /// authorize against — typically the generic MCP integration
    /// (`mcp-generic`), which lets end users connect any MCP server that
    /// supports dynamic client registration.
    pub integration_id: String,
}

/// HTTP [`NangoConnectService`] adapter against the Nango API.
///
/// Fresh access tokens are cached in memory per connection until shortly
/// before their reported expiry, so building a toolset for every chat
/// request doesn't hammer Nango.
pub struct NangoClient {
    http: reqwest::Client,
    config: NangoConfig,
    token_cache: Mutex<HashMap<String, CachedToken>>,
}

#[derive(Clone)]
struct CachedToken {
    token: String,
    valid_until: Instant,
}

impl NangoClient {
    /// Build a client from config. Fails only if the underlying HTTP client
    /// can't be constructed.
    pub fn new(config: NangoConfig) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .context("building Nango HTTP client")?;
        Ok(Self {
            http,
            config,
            token_cache: Mutex::new(HashMap::new()),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.config.base_url.trim_end_matches('/'), path)
    }

    fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        req.bearer_auth(&self.config.secret_key)
    }

    async fn fetch_connection(
        &self,
        connection_id: &str,
    ) -> anyhow::Result<Option<ConnectionResponse>> {
        let response = self
            .auth(
                self.http
                    .get(self.url(&format!("/connection/{connection_id}"))),
            )
            .query(&[("provider_config_key", self.config.integration_id.as_str())])
            .send()
            .await
            .context("fetching Nango connection")?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }

        let response = error_for_status(response).await?;
        let connection: ConnectionResponse = response
            .json()
            .await
            .context("decoding Nango connection response")?;
        Ok(Some(connection))
    }
}

impl NangoConnectService for NangoClient {
    #[tracing::instrument(skip(self), err)]
    async fn create_connect_session(
        &self,
        end_user: NangoEndUser,
        mcp_server_url: Option<&str>,
    ) -> anyhow::Result<NangoConnectSession> {
        let integration_id = &self.config.integration_id;

        let mut end_user_body = json!({ "id": end_user.id });
        if let Some(display_name) = end_user.display_name {
            end_user_body["display_name"] = json!(display_name);
        }
        let mut body = json!({
            "end_user": end_user_body,
            "allowed_integrations": [integration_id],
        });

        // Pre-filling the MCP server URL hides the URL form in the hosted
        // Connect UI and sends the user straight to the server's OAuth
        // consent screen.
        if let Some(url) = mcp_server_url {
            body["integrations_config_defaults"] = json!({
                integration_id: { "connection_config": { "mcp_server_url": url } }
            });
        }

        let response = self
            .auth(self.http.post(self.url("/connect/sessions")))
            .json(&body)
            .send()
            .await
            .context("creating Nango connect session")?;
        let response = error_for_status(response).await?;

        let session: ConnectSessionResponse = response
            .json()
            .await
            .context("decoding Nango connect session response")?;

        Ok(NangoConnectSession {
            token: session.data.token,
            expires_at: session.data.expires_at,
            connect_link: session.data.connect_link,
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_connection(&self, connection_id: &str) -> anyhow::Result<Option<NangoConnection>> {
        let Some(connection) = self.fetch_connection(connection_id).await? else {
            return Ok(None);
        };

        Ok(Some(NangoConnection {
            connection_id: connection.connection_id,
            end_user_id: connection.end_user.map(|u| u.id),
            mcp_server_url: connection
                .connection_config
                .get("mcp_server_url")
                .and_then(|v| v.as_str())
                .map(str::to_owned),
        }))
    }

    #[tracing::instrument(skip(self), err)]
    async fn fresh_token(&self, connection_id: &str) -> anyhow::Result<String> {
        if let Some(cached) = self.token_cache.lock().unwrap().get(connection_id)
            && cached.valid_until > Instant::now()
        {
            return Ok(cached.token.clone());
        }

        let connection = self
            .fetch_connection(connection_id)
            .await?
            .with_context(|| format!("Nango connection {connection_id} not found"))?;

        let credentials = connection
            .credentials
            .context("Nango connection has no credentials")?;
        let token = credentials
            .access_token
            .context("Nango connection has no access token")?;

        // Nango reports when the provider token expires; refreshes happen on
        // its side, so we only need to stop serving our cached copy in time.
        let ttl = credentials
            .expires_at
            .as_deref()
            .and_then(remaining_lifetime)
            .map(|lifetime| lifetime.saturating_sub(TOKEN_EXPIRY_MARGIN))
            .unwrap_or(DEFAULT_TOKEN_TTL)
            .min(DEFAULT_TOKEN_TTL);

        self.token_cache.lock().unwrap().insert(
            connection_id.to_owned(),
            CachedToken {
                token: token.clone(),
                valid_until: Instant::now() + ttl,
            },
        );

        Ok(token)
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete_connection(&self, connection_id: &str) -> anyhow::Result<()> {
        self.token_cache.lock().unwrap().remove(connection_id);

        let response = self
            .auth(
                self.http
                    .delete(self.url(&format!("/connection/{connection_id}"))),
            )
            .query(&[("provider_config_key", self.config.integration_id.as_str())])
            .send()
            .await
            .context("deleting Nango connection")?;

        // Already gone is success from the caller's point of view.
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        error_for_status(response).await?;
        Ok(())
    }
}

/// Seconds until an RFC 3339 timestamp, or `None` when it's in the past or
/// unparsable.
fn remaining_lifetime(expires_at: &str) -> Option<Duration> {
    let expires_at = chrono::DateTime::parse_from_rfc3339(expires_at).ok()?;
    let remaining = expires_at.signed_duration_since(chrono::Utc::now());
    remaining.to_std().ok()
}

/// Like `Response::error_for_status`, but includes the response body in the
/// error, since Nango returns structured error messages.
async fn error_for_status(response: reqwest::Response) -> anyhow::Result<reqwest::Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    anyhow::bail!("Nango API returned {status}: {body}")
}

// -- wire types ---------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ConnectSessionResponse {
    data: ConnectSessionData,
}

#[derive(Debug, Deserialize)]
struct ConnectSessionData {
    token: String,
    expires_at: String,
    connect_link: String,
}

#[derive(Debug, Deserialize)]
struct ConnectionResponse {
    connection_id: String,
    #[serde(default)]
    connection_config: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    end_user: Option<ConnectionEndUser>,
    #[serde(default)]
    credentials: Option<ConnectionCredentials>,
}

#[derive(Debug, Deserialize)]
struct ConnectionEndUser {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ConnectionCredentials {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    expires_at: Option<String>,
}
