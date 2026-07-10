//! Inbound adapters for the ai projections domain.

#[cfg(feature = "axum")]
pub mod axum_router;
#[cfg(feature = "toolset")]
pub mod toolset;
