/// Browsing the catalog of connectable MCP apps.
pub mod catalog;
/// Completion and revocation of Pipedream-managed MCP connections.
pub mod pipedream_connect;
/// MCP tool set and combined tool set for the AI loop.
pub mod toolset;

pub use catalog::browse_catalog;
pub use pipedream_connect::{
    PipedreamConnectError, complete_pipedream_connection, disconnect_mcp_server,
};
pub use toolset::{CombinedToolSet, McpToolSet};
