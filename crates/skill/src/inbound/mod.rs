//! Inbound adapters: HTTP handlers and AI tools.

pub mod axum_router;
#[cfg(feature = "ai_tools")]
pub mod toolset;
