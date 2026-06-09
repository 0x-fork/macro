//! Google Drive integration crate.
//!
//! Lets a Macro user connect their Google Drive account (OAuth, handled by
//! `authentication_service`), browse their Drive folder tree, and **import**
//! selected folders/files into Macro as Projects and Documents. This is a
//! one-way import (copy into Macro), not a continuous sync — matching the
//! product requirement of "import folders, but no sync".
//!
//! # Architecture
//!
//! Ports-and-adapters (hexagonal), mirroring the `github` crate:
//!
//! - [`domain`] — domain models, ports (traits), and the service
//!   implementations. The import orchestration is generic over a
//!   [`domain::ports::DriveImportSink`] so the Macro-storage details
//!   (Documents, Projects, S3, foreign-entity mapping) live in the calling
//!   service (`document_storage_service`) rather than here.
//! - [`outbound`] — adapters for external dependencies: the Drive REST client
//!   (`reqwest`), the access-token client (`authentication_service` + redis),
//!   and the `google_drive_links` Postgres repository.
//! - [`inbound`] — Axum handlers exposing browse/import/status endpoints.

#![deny(missing_docs)]

pub mod domain;

#[cfg(any(feature = "db", feature = "http", feature = "tokens"))]
pub mod outbound;

#[cfg(feature = "inbound")]
pub mod inbound;
