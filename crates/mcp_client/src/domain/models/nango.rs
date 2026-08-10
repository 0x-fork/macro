use serde::{Deserialize, Serialize};

/// A short-lived Nango Connect session, consumed by the frontend to open the
/// hosted Connect UI.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NangoConnectSession {
    /// The session token to pass to the Nango Connect UI.
    pub token: String,
    /// RFC 3339 expiry of the session token.
    pub expires_at: String,
    /// A shareable link that opens the same auth flow in a browser.
    pub connect_link: String,
}

/// A Nango connection as seen by the domain: who it belongs to and which MCP
/// server it authenticates against. Credentials stay inside Nango.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NangoConnection {
    /// Nango's unique connection ID.
    pub connection_id: String,
    /// The `end_user.id` recorded when the Connect session was created.
    pub end_user_id: Option<String>,
    /// The MCP server URL this connection authenticates against
    /// (`connection_config.mcp_server_url` on generic MCP integrations).
    pub mcp_server_url: Option<String>,
}

/// The end user a Nango Connect session is created for.
#[derive(Clone, Debug)]
pub struct NangoEndUser {
    /// Stable user ID, echoed back on the connection as `end_user.id`.
    pub id: String,
    /// Optional display name shown in the Nango dashboard.
    pub display_name: Option<String>,
}
