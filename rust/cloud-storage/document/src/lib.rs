//! Document domain crate providing traits and models for document operations.
//!
//! This crate follows the hexagonal architecture pattern, separating domain logic
//! from infrastructure concerns like HTTP handlers and database implementations.

pub mod domain;
#[cfg(feature = "outbound")]
pub mod outbound;
