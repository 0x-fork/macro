//! Document domain crate providing traits and models for document operations.
//!
//! This crate follows the hexagonal architecture pattern, separating domain logic
//! from infrastructure concerns like HTTP handlers and database implementations.

pub mod domain;
#[cfg(feature = "outbound")]
pub mod outbound;

// Re-export all types from models_document for backwards compatibility
pub mod models {
    //! Document models re-exported from models_document crate.
    pub use models_document::*;
}
