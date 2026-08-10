use super::consts::MCP_CLIENT_NAME;
use crate::domain::ports::{McpConnector, McpServerStore};
use crate::domain::service::PersistingCredentialStore;
use macro_user_id::user_id::MacroUserIdStr;
use rmcp::RoleClient;
use rmcp::model::{ClientInfo, Implementation};
use rmcp::service::{RunningService, ServiceExt};
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::transport::auth::{AuthClient, AuthorizationManager, StoredCredentials};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A connected MCP server session.
pub type McpServer = RunningService<RoleClient, ClientInfo>;

/// Build the client info sent to MCP servers during initialization.
pub fn client_info() -> ClientInfo {
    ClientInfo::new(
        Default::default(),
        Implementation::new(MCP_CLIENT_NAME, env!("CARGO_PKG_VERSION")),
    )
}

/// Connection details for an MCP server.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct McpServerConnectionInfo {
    /// Human-readable server name.
    pub name: String,
    /// The server's streamable HTTP URL.
    pub url: String,
}

/// A persisted MCP server entry with connection info and credentials.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct McpServerRecord {
    /// The user who owns these credentials.
    pub user_id: MacroUserIdStr<'static>,
    /// The server URL these credentials authenticate against.
    pub url: String,
    /// Name of the MCP server.
    pub server_name: String,
    /// The OAuth credentials.
    #[serde(skip)]
    pub credentials: Option<StoredCredentials>,
    /// Whether the user has this toolset enabled.
    pub enabled: bool,
    /// The Nango connection that manages this server's OAuth grant, when the
    /// server was connected through Nango rather than the legacy OAuth flow.
    pub nango_connection_id: Option<String>,
    /// A fresh access token resolved from Nango at load time. Never
    /// persisted; token refresh and storage live entirely inside Nango.
    #[serde(skip)]
    pub bearer_token: Option<String>,
}

impl McpServerRecord {
    /// Whether the server has a usable auth grant (either a Nango connection
    /// or legacy stored credentials).
    pub fn is_authenticated(&self) -> bool {
        self.nango_connection_id.is_some() || self.credentials.is_some()
    }
}

impl McpConnector for McpServerRecord {
    #[tracing::instrument(skip_all, err)]
    async fn connect<S: McpServerStore>(&self, server_store: Arc<S>) -> anyhow::Result<McpServer> {
        // A Nango-managed token takes priority: Nango owns refresh and
        // storage, so the client just presents the token as a bearer.
        if let Some(token) = &self.bearer_token {
            let mut headers = reqwest::header::HeaderMap::new();
            let mut value = reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
                .map_err(|e| anyhow::anyhow!("invalid bearer token: {e}"))?;
            value.set_sensitive(true);
            headers.insert(reqwest::header::AUTHORIZATION, value);
            let client = reqwest::Client::builder()
                .default_headers(headers)
                .build()?;

            let config = StreamableHttpClientTransportConfig::with_uri(&*self.url);
            let transport = StreamableHttpClientTransport::with_client(client, config);
            return Ok(client_info().serve(transport).await?);
        }

        match &self.credentials {
            Some(credentials) => {
                let mut auth_manager = AuthorizationManager::new(&self.url).await?;
                let store = PersistingCredentialStore::new(self.clone(), server_store);
                store.seed(credentials.clone()).await?;
                auth_manager.set_credential_store(store);
                auth_manager.initialize_from_store().await?;

                let auth_client = AuthClient::new(reqwest::Client::new(), auth_manager);
                let config = StreamableHttpClientTransportConfig::with_uri(&*self.url);
                let transport = StreamableHttpClientTransport::with_client(auth_client, config);

                Ok(client_info().serve(transport).await?)
            }
            None => {
                let transport = StreamableHttpClientTransport::from_uri(&*self.url);
                Ok(client_info().serve(transport).await?)
            }
        }
    }
}
