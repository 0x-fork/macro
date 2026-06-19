#![deny(missing_docs)]
//! Custom emoji hexagonal crate.
//!
//! Team-scoped custom emoji: the image bytes live in the static file service,
//! and a row links a team + slug to that file. Members type a slug (team-scoped
//! resolution); the immutable id is what messages reference, so an emoji renders
//! for anyone who receives it (render-on-encounter) regardless of team.
//!
//! - **domain**: models, ports (traits), and the service implementation
//! - **inbound**: axum adapters for incoming requests
//! - **outbound**: postgres adapter

/// Domain models, ports, and service logic.
pub mod domain;

/// Inbound adapters (axum router).
#[cfg(feature = "inbound")]
pub mod inbound;

/// Outbound adapters (postgres).
#[cfg(feature = "outbound")]
pub mod outbound;
