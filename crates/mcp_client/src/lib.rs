#![deny(missing_docs)]
//! MCP connector integration: users connect apps through Pipedream Connect
//! (the single auth path — Pipedream owns grants, tokens, and refresh), and
//! the AI loop calls their tools through Pipedream's remote MCP server.

/// Domain layer: models, ports, and service.
pub mod domain;

/// Inbound adapters (HTTP/axum).
pub mod inbound;

/// Outbound adapters for Pipedream and Postgres.
pub mod outbound;
