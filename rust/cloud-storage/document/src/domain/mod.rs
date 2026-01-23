//! Domain module containing models and ports for document operations.

pub mod models;
#[cfg(feature = "ports")]
pub mod ports;
#[cfg(feature = "ports")]
pub mod service;
