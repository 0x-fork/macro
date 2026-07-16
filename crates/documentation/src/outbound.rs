//! Outbound adapters for documentation sites.

/// MacroDB-backed repository.
pub mod pg_repo;

/// Markdown export via the lexical service.
pub mod lexical_content_source;

/// Published-site storage on S3.
pub mod s3_site_store;

/// Team-plan / toggle gate backed by the teams crate.
pub mod teams_gate;
