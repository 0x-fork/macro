#![deny(missing_docs)]
//! Parent-generic message threads.
//!
//! This crate is the unification seam between channel threads and entity
//! comment threads ("unified thread architecture", see
//! `docs/unified-thread-architecture.md`). A message thread hangs off an
//! arbitrary parent [`model_entity::Entity`] — a channel, a document, a CRM
//! company, etc. — instead of being hard-wired to a channel. Messages live in
//! the existing `comms_messages` table via its polymorphic
//! `parent_type`/`parent_id` columns; thread-level state that channels never
//! needed (resolved flag, lexical anchor mark id, legacy comment ids) lives in
//! the `comms_thread_details` side table.
//!
//! Draft status: the `channels` crate still owns the channel-parented write
//! path and its side-effect pipeline (notifications, search indexing,
//! contacts). This crate serves entity-parented threads end to end and reads
//! channel-parented rows uniformly; converging `channels` onto this service is
//! a follow-up.

pub mod domain;
pub mod inbound;
pub mod outbound;
