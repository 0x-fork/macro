use super::models::{
    MacroUserIdStr, McpServer, McpServerRecord, NangoConnectSession, NangoConnection, NangoEndUser,
};
use std::sync::Arc;

/// Port for persisting MCP server records, keyed by user.
pub trait McpServerStore: Send + Sync + 'static {
    /// Error type for store operations.
    type Err: Send + std::fmt::Debug;

    /// Persist a server record, overwriting any existing entry for the same user and URL.
    fn save(&self, record: &McpServerRecord) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Load a server record for a user and server URL. Returns `None` if not stored.
    fn load(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
    ) -> impl Future<Output = Result<Option<McpServerRecord>, Self::Err>> + Send;

    /// Delete a server record for a user and server URL.
    fn delete(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// List all stored server records for a user.
    fn list(
        &self,
        user_id: &MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Vec<McpServerRecord>, Self::Err>> + Send;
}

/// Port for establishing a connection to an MCP server.
pub trait McpConnector: Send + Sync {
    /// Connect to the MCP server described by this value.
    ///
    /// Credential updates produced while connecting — and later, while the
    /// connection is in use (e.g. refreshed OAuth tokens) — are persisted
    /// through `server_store`.
    fn connect<S: McpServerStore>(
        &self,
        server_store: Arc<S>,
    ) -> impl Future<Output = anyhow::Result<McpServer>> + Send;
}

/// Port for delegating MCP server authorization to Nango.
///
/// Nango owns the whole OAuth lifecycle for MCP servers (endpoint discovery,
/// dynamic client registration, token storage, and refresh). The domain only
/// ever sees short-lived session tokens, connection metadata, and fresh
/// access tokens.
pub trait NangoConnectService: Send + Sync + 'static {
    /// Create a Connect session for `end_user`.
    ///
    /// When `mcp_server_url` is provided it is pre-filled on the integration's
    /// connection config, so the hosted Connect UI skips the URL form and
    /// jumps straight to the MCP server's OAuth consent screen.
    fn create_connect_session(
        &self,
        end_user: NangoEndUser,
        mcp_server_url: Option<&str>,
    ) -> impl Future<Output = anyhow::Result<NangoConnectSession>> + Send;

    /// Fetch a connection's metadata. Returns `None` if Nango doesn't know
    /// the connection ID.
    fn get_connection(
        &self,
        connection_id: &str,
    ) -> impl Future<Output = anyhow::Result<Option<NangoConnection>>> + Send;

    /// Fetch a fresh access token for a connection. Nango refreshes expired
    /// tokens server-side before returning them.
    fn fresh_token(
        &self,
        connection_id: &str,
    ) -> impl Future<Output = anyhow::Result<String>> + Send;

    /// Delete a connection from Nango (revoking our copy of the grant).
    fn delete_connection(
        &self,
        connection_id: &str,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;
}

/// Everything needed to resume the OAuth flow on callback.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct PendingAuth {
    /// PKCE verifier generated during authorization start.
    pub pkce_verifier: String,
    /// OAuth client ID obtained during dynamic registration.
    pub client_id: String,
    /// OAuth client secret, if the server issued one.
    pub client_secret: Option<String>,
    /// The user who initiated the flow.
    pub user_id: String,
    /// The MCP server URL being authorized.
    pub server_url: String,
    /// Human-readable server name.
    pub server_name: String,
}

/// Port for storing ephemeral OAuth state across requests.
///
/// Implementations must support cross-instance access (e.g. Redis) and
/// should expire entries after a reasonable TTL.
pub trait OAuthStateStore: Send + Sync + 'static {
    /// Save a pending authorization, keyed by CSRF state token.
    fn save(
        &self,
        csrf_token: &str,
        pending: PendingAuth,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;

    /// Load and remove a pending authorization by CSRF state token.
    fn take(
        &self,
        csrf_token: &str,
    ) -> impl Future<Output = anyhow::Result<Option<PendingAuth>>> + Send;
}

/// Port for driving the OAuth authorization-code flow for an MCP server.
///
/// Implementations manage the full PKCE handshake: discovering server metadata,
/// registering a client, building the authorization URL, and exchanging the
/// callback code for tokens.
pub trait OAuthClient: Send + Sync + 'static {
    /// Begin the OAuth flow for `server_url`.
    ///
    /// Discovers the server's OAuth metadata, registers a dynamic client if
    /// needed, and returns the authorization URL the user should be redirected to.
    fn start_authorization(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
        server_name: &str,
    ) -> impl Future<Output = anyhow::Result<String>> + Send;

    /// Complete the OAuth flow using the `code` and `state` returned by the
    /// authorization server's redirect.
    ///
    /// Exchanges the authorization code for tokens, persists them, and
    /// returns the saved server record (user, url, credentials).
    fn exchange_authorization_code(
        &self,
        code: &str,
        state: &str,
    ) -> impl Future<Output = anyhow::Result<McpServerRecord>> + Send;
}
