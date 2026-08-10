/// Browsing the catalog of connectable MCP servers.
pub mod catalog;
/// Completion of Nango-managed MCP authorizations.
pub mod nango_connect;
/// Write-through OAuth credential store for MCP connections.
pub mod persisting_credential_store;
/// MCP tool set and combined tool set for the AI loop.
pub mod toolset;

pub use catalog::browse_catalog;
pub use nango_connect::{NangoConnectError, complete_nango_connection};
pub use persisting_credential_store::PersistingCredentialStore;
pub use toolset::{CombinedToolSet, McpToolSet};
