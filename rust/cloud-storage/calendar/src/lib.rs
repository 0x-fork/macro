//! Calendar service library.
//!
//! Hexagonal-architecture calendar feature: user-owned events with invited
//! attendees, exposed over HTTP and persisted in Postgres. Mirrors the layout
//! of the `contacts` crate (domain / inbound / outbound).

#![deny(missing_docs)]

/// Domain layer: models, port traits, and the calendar service.
pub mod domain;
/// Inbound adapters (HTTP handlers + router + OpenAPI doc).
#[cfg(feature = "inbound")]
pub mod inbound;
/// Outbound adapters (Postgres repository).
#[cfg(feature = "outbound")]
pub mod outbound;
