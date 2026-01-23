//! Outbound adapters for the document domain.
//!
//! This module contains implementations of the domain ports (traits) using
//! concrete infrastructure like PostgreSQL, S3, and external services.
//!
pub mod metadata;
pub mod storage;
