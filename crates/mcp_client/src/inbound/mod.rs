/// Axum HTTP adapter for MCP connector management.
pub mod axum_router;

pub use axum_router::{McpRouterState, mcp_router};
