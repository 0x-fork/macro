use super::consts::MCP_CLIENT_NAME;
use macro_user_id::user_id::MacroUserIdStr;
use rmcp::RoleClient;
use rmcp::model::{ClientInfo, Implementation};
use rmcp::service::RunningService;

/// A connected MCP server session.
pub type McpServer = RunningService<RoleClient, ClientInfo>;

/// Build the client info sent to MCP servers during initialization.
pub fn client_info() -> ClientInfo {
    ClientInfo::new(
        Default::default(),
        Implementation::new(MCP_CLIENT_NAME, env!("CARGO_PKG_VERSION")),
    )
}

/// An MCP connector a user has connected through Pipedream.
///
/// Pipedream owns the OAuth grant and tokens for the connected account; we
/// store only which app the user connected and the Pipedream account ID the
/// grant lives under.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpServerRecord {
    /// The user who connected the app.
    pub user_id: MacroUserIdStr<'static>,
    /// Pipedream app name slug, e.g. `linear` or `notion`.
    pub app_slug: String,
    /// Human-readable display name, e.g. `Linear`.
    pub server_name: String,
    /// The Pipedream connected-account ID holding the grant.
    pub account_id: String,
    /// Whether the connector is enabled for tool use.
    pub enabled: bool,
}
