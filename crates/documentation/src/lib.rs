#![deny(missing_docs)]
//! Documentation hexagonal architecture crate.
//!
//! Teams author documentation sites from their existing markdown documents:
//! a site is a curated, ordered nav tree of pages, each page backed by a
//! Macro markdown document. Publishing renders the site to static HTML with
//! the default theme and uploads it to object storage, where it is served
//! publicly by the docs-sites CDN.
//!
//! # Architecture
//!
//! - **domain**: models, ports (traits), the service implementation, and the
//!   pure static-site generator
//! - **inbound**: axum handlers for the `/documentation` API
//! - **outbound**: adapters for PostgreSQL, the lexical service (markdown
//!   export), S3 (published site storage), and the teams crate (plan gate)

/// The domain module contains the domain logic for documentation sites
pub mod domain;

/// The inbound module contains the inbound adapters for documentation sites
#[cfg(feature = "inbound")]
pub mod inbound;

/// The outbound module contains the outbound adapters for documentation sites
#[cfg(feature = "outbound")]
pub mod outbound;
