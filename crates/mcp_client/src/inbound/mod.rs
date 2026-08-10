/// Axum HTTP adapter for MCP server management and OAuth callbacks.
pub mod axum_router;

pub use axum_router::{
    McpCatalogRouterState, McpRouterState, mcp_catalog_router, mcp_oauth_callback_router,
    mcp_router,
};
