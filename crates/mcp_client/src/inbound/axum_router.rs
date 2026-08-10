use crate::domain::{
    models::{McpServerRecord, NangoEndUser, OAuthClientMetadata},
    ports::{McpServerStore, NangoConnectService, OAuthClient},
    service::nango_connect::{
        NangoConnectError, complete_nango_connection, disconnect_mcp_server,
    },
};
use axum::{
    Json, Router,
    extract::{FromRef, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
};
use macro_authorization::{
    MacroAuthorizationExtractor, MacroAuthorizationService, MacroAuthorizationState, UserOrInternal,
};
use model_error_response::ErrorResponse;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{IntoParams, ToSchema};

#[cfg(test)]
mod test;

/// Hook invoked after an OAuth flow completes and the credentials are saved.
/// Hosts use this to react to a connection the moment it exists (e.g. start
/// import gather jobs); implementations must be quick or spawn.
pub type McpAuthCompletedHook = Arc<
    dyn Fn(McpServerRecord) -> std::pin::Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
>;

/// Shared state for the MCP router.
pub struct McpRouterState<S, O, N, Auth> {
    store: Arc<S>,
    oauth: Arc<O>,
    nango: Option<Arc<N>>,
    authorization_state: MacroAuthorizationState<Auth>,
    client_metadata: OAuthClientMetadata,
    on_auth_completed: Option<McpAuthCompletedHook>,
}

impl<S, O, N, Auth> Clone for McpRouterState<S, O, N, Auth> {
    fn clone(&self) -> Self {
        Self {
            store: self.store.clone(),
            oauth: self.oauth.clone(),
            nango: self.nango.clone(),
            authorization_state: self.authorization_state.clone(),
            client_metadata: self.client_metadata.clone(),
            on_auth_completed: self.on_auth_completed.clone(),
        }
    }
}

impl<S, O, N, Auth> FromRef<McpRouterState<S, O, N, Auth>> for MacroAuthorizationState<Auth> {
    fn from_ref(state: &McpRouterState<S, O, N, Auth>) -> Self {
        state.authorization_state.clone()
    }
}

impl<S, O, N, Auth> McpRouterState<S, O, N, Auth>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
{
    /// Create a new router state from a server store, OAuth client, optional
    /// Nango client, and authorization state.
    ///
    /// When `nango` is `None` the Nango endpoints answer 501 and connecting
    /// falls back to the legacy in-house OAuth flow.
    pub fn new(
        store: S,
        oauth: O,
        nango: Option<Arc<N>>,
        authorization_state: MacroAuthorizationState<Auth>,
        client_metadata: OAuthClientMetadata,
    ) -> Self {
        Self {
            store: Arc::new(store),
            oauth: Arc::new(oauth),
            nango,
            authorization_state,
            client_metadata,
            on_auth_completed: None,
        }
    }

    /// Invoke `hook` whenever an OAuth flow completes (see
    /// [`McpAuthCompletedHook`]).
    pub fn with_auth_completed_hook(mut self, hook: McpAuthCompletedHook) -> Self {
        self.on_auth_completed = Some(hook);
        self
    }

    /// Access the underlying server store.
    pub fn store(&self) -> Arc<S> {
        self.store.clone()
    }
}

/// Authenticated MCP routes (CRUD + start auth + Nango Connect).
pub fn mcp_router<S, O, N, Auth, Global>(state: McpRouterState<S, O, N, Auth>) -> Router<Global>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
    Global: Send + Sync,
{
    Router::new()
        .route("/mcp/servers", get(list_servers::<S, O, N, Auth>))
        .route("/mcp/servers", post(add_server::<S, O, N, Auth>))
        .route("/mcp/servers", put(update_server::<S, O, N, Auth>))
        .route("/mcp/servers", delete(delete_server::<S, O, N, Auth>))
        .route("/mcp/servers/auth/start", post(start_auth::<S, O, N, Auth>))
        .route(
            "/mcp/servers/nango/session",
            post(create_nango_session::<S, O, N, Auth>),
        )
        .route(
            "/mcp/servers/nango/complete",
            post(complete_nango_session::<S, O, N, Auth>),
        )
        .with_state(state)
}

/// Unauthenticated OAuth callback and client metadata routes.
pub fn mcp_oauth_callback_router<S, O, N, Auth, Global>(
    state: McpRouterState<S, O, N, Auth>,
) -> Router<Global>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
    Global: Send + Sync,
{
    Router::new()
        .route(
            "/mcp/servers/auth/callback",
            get(auth_callback::<S, O, N, Auth>),
        )
        .route(
            "/mcp/servers/auth/client-metadata",
            get(client_metadata::<S, O, N, Auth>),
        )
        .with_state(state)
}

// -- request / response types ------------------------------------------------

/// Request body for adding a new MCP server.
#[derive(Debug, Deserialize, ToSchema)]
pub struct AddServerRequest {
    /// The MCP server's streamable HTTP URL.
    url: String,
    /// Human-readable name for the server.
    server_name: String,
}

/// Request body for updating an MCP server.
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateServerRequest {
    /// The server URL to update.
    url: String,
    /// New name for the server.
    #[serde(default)]
    server_name: Option<String>,
    /// Enable or disable the server.
    #[serde(default)]
    enabled: Option<bool>,
}

/// Query parameters for deleting an MCP server.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct DeleteServerParams {
    /// The server URL to delete.
    url: String,
}

/// Request body for starting an OAuth authorization flow.
#[derive(Debug, Deserialize, ToSchema)]
pub struct StartAuthRequest {
    /// The MCP server URL to authorize against.
    server_url: String,
    /// Human-readable name for the server.
    server_name: String,
}

/// Response from starting an OAuth authorization flow.
#[derive(Debug, Serialize, ToSchema)]
pub struct StartAuthResponse {
    /// The OAuth authorization URL to redirect the user to.
    authorization_url: String,
}

/// Query parameters received on the OAuth callback redirect.
///
/// Providers redirect here on both success (`code` + `state`) and failure
/// (`error` [+ `error_description`], per RFC 6749 §4.1.2.1). All fields are
/// optional so a rejected authorization can still be parsed and logged
/// instead of failing Axum's query extraction before the handler runs.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AuthCallbackParams {
    /// Authorization code from the OAuth provider. Present on success.
    code: Option<String>,
    /// CSRF state parameter.
    state: Option<String>,
    /// OAuth error code from the provider, e.g. `access_denied`. Present on failure.
    error: Option<String>,
    /// Human-readable error description from the provider.
    error_description: Option<String>,
}

/// Request body for creating a Nango Connect session.
#[derive(Debug, Deserialize, ToSchema)]
pub struct NangoSessionRequest {
    /// The MCP server URL to authorize against. When set, the hosted Connect
    /// UI skips its URL form and goes straight to the server's OAuth consent
    /// screen. When omitted, the Connect UI prompts the user for a URL.
    #[serde(default)]
    server_url: Option<String>,
}

/// Response from creating a Nango Connect session.
#[derive(Debug, Serialize, ToSchema)]
pub struct NangoSessionResponse {
    /// Short-lived session token to open the Nango Connect UI with.
    session_token: String,
    /// RFC 3339 expiry of the session token.
    expires_at: String,
    /// Shareable link that opens the same auth flow in a browser tab.
    connect_link: String,
}

/// Request body for completing a Nango Connect flow.
#[derive(Debug, Deserialize, ToSchema)]
pub struct NangoCompleteRequest {
    /// The connection ID reported by the Nango Connect UI on success.
    connection_id: String,
    /// Optional human-readable name for the server. Defaults to the server's
    /// host for new servers; existing servers keep their name.
    #[serde(default)]
    server_name: Option<String>,
}

/// An MCP server record as returned by the API.
#[derive(Debug, Serialize, ToSchema)]
pub struct ServerResponse {
    /// The MCP server URL.
    url: String,
    /// Human-readable server name.
    server_name: String,
    /// Whether the server is enabled for tool use.
    enabled: bool,
    /// Whether the server has valid stored credentials.
    authenticated: bool,
}

impl ServerResponse {
    fn from_record(record: &McpServerRecord) -> Self {
        Self {
            url: record.url.clone(),
            server_name: record.server_name.clone(),
            enabled: record.enabled,
            authenticated: record.is_authenticated(),
        }
    }
}

// -- error --------------------------------------------------------------------

/// Error type for MCP HTTP handlers.
#[derive(Debug, thiserror::Error)]
pub enum McpHandlerErr {
    /// The requested server was not found.
    #[error("server not found")]
    NotFound,
    /// The OAuth provider rejected the authorization request.
    #[error("authorization rejected by provider: {0}")]
    OAuthRejected(String),
    /// The callback was missing both a code and an error parameter.
    #[error("malformed OAuth callback: missing code and error parameters")]
    MalformedCallback,
    /// The request referenced something invalid.
    #[error("{0}")]
    InvalidRequest(String),
    /// Nango is not configured for this deployment.
    #[error("Nango is not configured")]
    NangoNotConfigured,
    /// An internal error occurred.
    #[error("{0}")]
    Internal(#[from] anyhow::Error),
}

impl From<NangoConnectError> for McpHandlerErr {
    fn from(err: NangoConnectError) -> Self {
        match err {
            NangoConnectError::NotFound => McpHandlerErr::NotFound,
            NangoConnectError::MissingServerUrl => McpHandlerErr::InvalidRequest(err.to_string()),
            NangoConnectError::Internal(e) => McpHandlerErr::Internal(e),
        }
    }
}

impl IntoResponse for McpHandlerErr {
    fn into_response(self) -> axum::response::Response {
        let status = match &self {
            McpHandlerErr::NotFound => StatusCode::NOT_FOUND,
            McpHandlerErr::OAuthRejected(_)
            | McpHandlerErr::MalformedCallback
            | McpHandlerErr::InvalidRequest(_) => StatusCode::BAD_REQUEST,
            McpHandlerErr::NangoNotConfigured => StatusCode::NOT_IMPLEMENTED,
            McpHandlerErr::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (
            status,
            Json(ErrorResponse {
                message: self.to_string().into(),
            }),
        )
            .into_response()
    }
}

// -- handlers -----------------------------------------------------------------

#[utoipa::path(
    get,
    path = "/mcp/servers",
    tag = "mcp",
    operation_id = "list_mcp_servers",
    responses(
        (status = 200, body = Vec<ServerResponse>),
        (status = 401, body = String),
        (status = 500, body = ErrorResponse),
    )
)]
/// List all MCP servers configured for the authenticated user.
#[tracing::instrument(skip_all, err)]
pub async fn list_servers<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
) -> Result<Json<Vec<ServerResponse>>, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
{
    let user = &authorization.authorization.user;
    let records = state
        .store
        .list(&user.macro_user_id)
        .await
        .map_err(anyhow::Error::from)?;

    Ok(Json(
        records.iter().map(ServerResponse::from_record).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/mcp/servers",
    tag = "mcp",
    operation_id = "add_mcp_server",
    request_body = AddServerRequest,
    responses(
        (status = 201, body = ServerResponse),
        (status = 401, body = String),
        (status = 500, body = ErrorResponse),
    )
)]
/// Add a new MCP server for the authenticated user.
#[tracing::instrument(skip_all, err)]
pub async fn add_server<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(body): Json<AddServerRequest>,
) -> Result<(StatusCode, Json<ServerResponse>), McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
{
    let user = &authorization.authorization.user;
    let record = McpServerRecord {
        user_id: user.macro_user_id.clone(),
        url: body.url,
        server_name: body.server_name,
        credentials: None,
        enabled: true,
        nango_connection_id: None,
        bearer_token: None,
    };

    state
        .store
        .save(&record)
        .await
        .map_err(anyhow::Error::from)?;

    Ok((
        StatusCode::CREATED,
        Json(ServerResponse::from_record(&record)),
    ))
}

#[utoipa::path(
    put,
    path = "/mcp/servers",
    tag = "mcp",
    operation_id = "update_mcp_server",
    request_body = UpdateServerRequest,
    responses(
        (status = 200, body = ServerResponse),
        (status = 401, body = String),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
/// Update an existing MCP server's name or enabled status.
#[tracing::instrument(skip_all, err)]
pub async fn update_server<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(body): Json<UpdateServerRequest>,
) -> Result<Json<ServerResponse>, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
{
    let user = &authorization.authorization.user;
    let mut record = state
        .store
        .load(&user.macro_user_id, &body.url)
        .await
        .map_err(anyhow::Error::from)?
        .ok_or(McpHandlerErr::NotFound)?;

    if let Some(name) = body.server_name {
        record.server_name = name;
    }
    if let Some(enabled) = body.enabled {
        record.enabled = enabled;
    }

    state
        .store
        .save(&record)
        .await
        .map_err(anyhow::Error::from)?;

    Ok(Json(ServerResponse::from_record(&record)))
}

#[utoipa::path(
    delete,
    path = "/mcp/servers",
    tag = "mcp",
    operation_id = "delete_mcp_server",
    params(DeleteServerParams),
    responses(
        (status = 204),
        (status = 401, body = String),
        (status = 500, body = ErrorResponse),
    )
)]
/// Delete an MCP server by URL.
#[tracing::instrument(skip_all, err)]
pub async fn delete_server<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Query(params): Query<DeleteServerParams>,
) -> Result<StatusCode, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
{
    let user = &authorization.authorization.user;
    disconnect_mcp_server(
        state.store.as_ref(),
        state.nango.as_deref(),
        &user.macro_user_id,
        &params.url,
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/mcp/servers/nango/session",
    tag = "mcp",
    operation_id = "create_mcp_nango_session",
    request_body = NangoSessionRequest,
    responses(
        (status = 200, body = NangoSessionResponse),
        (status = 401, body = String),
        (status = 501, body = ErrorResponse, description = "Nango is not configured for this deployment"),
        (status = 500, body = ErrorResponse),
    )
)]
/// Create a Nango Connect session for authorizing an MCP server.
///
/// The frontend opens the Nango Connect UI with the returned session token;
/// Nango then drives the MCP server's OAuth flow (endpoint discovery, dynamic
/// client registration, consent) and stores the resulting tokens.
#[tracing::instrument(skip_all, err)]
pub async fn create_nango_session<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(body): Json<NangoSessionRequest>,
) -> Result<Json<NangoSessionResponse>, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
{
    let nango = state
        .nango
        .as_ref()
        .ok_or(McpHandlerErr::NangoNotConfigured)?;
    let user = &authorization.authorization.user;

    let session = nango
        .create_connect_session(
            NangoEndUser {
                id: user.macro_user_id.as_ref().to_owned(),
                display_name: None,
            },
            body.server_url.as_deref(),
        )
        .await?;

    Ok(Json(NangoSessionResponse {
        session_token: session.token,
        expires_at: session.expires_at,
        connect_link: session.connect_link,
    }))
}

#[utoipa::path(
    post,
    path = "/mcp/servers/nango/complete",
    tag = "mcp",
    operation_id = "complete_mcp_nango_session",
    request_body = NangoCompleteRequest,
    responses(
        (status = 201, body = ServerResponse),
        (status = 400, body = ErrorResponse, description = "The connection has no MCP server URL"),
        (status = 401, body = String),
        (status = 404, body = ErrorResponse, description = "Unknown connection, or owned by another user"),
        (status = 501, body = ErrorResponse, description = "Nango is not configured for this deployment"),
        (status = 500, body = ErrorResponse),
    )
)]
/// Complete a Nango Connect flow by attaching the new connection to the
/// user's MCP servers.
///
/// The connection is verified against Nango (it must exist and belong to the
/// calling user) before anything is stored, so a caller can't attach
/// someone else's connection by guessing IDs.
#[tracing::instrument(skip_all, err)]
pub async fn complete_nango_session<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(body): Json<NangoCompleteRequest>,
) -> Result<(StatusCode, Json<ServerResponse>), McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
    anyhow::Error: From<S::Err>,
{
    let nango = state
        .nango
        .as_ref()
        .ok_or(McpHandlerErr::NangoNotConfigured)?;
    let user = &authorization.authorization.user;

    let record = complete_nango_connection(
        state.store.as_ref(),
        nango.as_ref(),
        &user.macro_user_id,
        &body.connection_id,
        body.server_name,
    )
    .await?;

    // Same contract as the legacy OAuth callback: let the host react to the
    // brand-new connection (e.g. kick off import gather jobs).
    if let Some(hook) = &state.on_auth_completed {
        hook(record.clone()).await;
    }

    Ok((
        StatusCode::CREATED,
        Json(ServerResponse::from_record(&record)),
    ))
}

#[utoipa::path(
    post,
    path = "/mcp/servers/auth/start",
    tag = "mcp",
    operation_id = "start_mcp_auth",
    request_body = StartAuthRequest,
    responses(
        (status = 200, body = StartAuthResponse),
        (status = 401, body = String),
        (status = 500, body = ErrorResponse),
    )
)]
/// Start the OAuth authorization flow for an MCP server.
#[tracing::instrument(skip_all, err)]
pub async fn start_auth<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    authorization: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(body): Json<StartAuthRequest>,
) -> Result<Json<StartAuthResponse>, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
{
    let user = &authorization.authorization.user;
    let authorization_url = state
        .oauth
        .start_authorization(&user.macro_user_id, &body.server_url, &body.server_name)
        .await?;

    Ok(Json(StartAuthResponse { authorization_url }))
}

#[utoipa::path(
    get,
    path = "/mcp/servers/auth/client-metadata",
    tag = "mcp",
    operation_id = "mcp_oauth_client_metadata",
    responses(
        (status = 200, description = "Macro OAuth client metadata document"),
    )
)]
/// Return Macro's public OAuth Client ID Metadata Document.
pub async fn client_metadata<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
) -> Json<OAuthClientMetadata>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
{
    Json(state.client_metadata.clone())
}

/// Classify a callback as a successful `(code, state)` pair or a handler
/// error, logging provider rejections and malformed callbacks along the way.
fn parse_callback_params(params: AuthCallbackParams) -> Result<(String, String), McpHandlerErr> {
    if let Some(error) = params.error {
        let reason = match params.error_description {
            Some(description) => format!("{error}: {description}"),
            None => error,
        };
        tracing::warn!(reason, "MCP OAuth provider rejected authorization");
        return Err(McpHandlerErr::OAuthRejected(reason));
    }

    match (params.code, params.state) {
        (Some(code), Some(state)) => Ok((code, state)),
        _ => {
            tracing::warn!("MCP OAuth callback missing both code and error parameters");
            Err(McpHandlerErr::MalformedCallback)
        }
    }
}

#[utoipa::path(
    get,
    path = "/mcp/servers/auth/callback",
    tag = "mcp",
    operation_id = "mcp_auth_callback",
    params(AuthCallbackParams),
    responses(
        (status = 200, description = "OAuth flow completed successfully"),
        (status = 400, body = ErrorResponse, description = "Provider rejected authorization, or the callback was malformed"),
        (status = 500, body = ErrorResponse),
    )
)]
/// OAuth callback endpoint — receives code and state, or an error, from the
/// authorization server.
#[tracing::instrument(skip_all, err, fields(state = ?params.state))]
pub async fn auth_callback<S, O, N, Auth>(
    State(state): State<McpRouterState<S, O, N, Auth>>,
    Query(params): Query<AuthCallbackParams>,
) -> Result<String, McpHandlerErr>
where
    S: McpServerStore,
    O: OAuthClient,
    N: NangoConnectService,
    Auth: MacroAuthorizationService,
{
    let (code, csrf_state) = parse_callback_params(params)?;

    let record = state
        .oauth
        .exchange_authorization_code(&code, &csrf_state)
        .await?;

    // Let the host react to the brand-new connection (e.g. kick off import
    // gather jobs) before the user even returns to their original tab.
    if let Some(hook) = &state.on_auth_completed {
        hook(record).await;
    }

    Ok("Authorization successful. You can close this tab.".to_string())
}
