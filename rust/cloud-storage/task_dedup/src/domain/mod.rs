//! Domain model, ports, and services for task duplicate detection and document
//! similarity search.

pub mod document_similarity;
pub mod models;
pub mod ports;
pub(crate) mod retrieval;
pub mod service;
