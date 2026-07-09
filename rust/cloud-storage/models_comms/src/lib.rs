#![deny(missing_docs)]
//! Shared vocabulary for comms messages, used by every surface that reads or
//! writes `comms_messages` and its sidecar tables (`channels`,
//! `message_threads`, `comms_db_client`).
//!
//! These types are parent-agnostic: they describe a message's reactions,
//! attachments, and mentions regardless of whether the message hangs off a
//! channel or any other entity (see `docs/unified-thread-architecture.md`).
//! Message-shape types themselves still live per-crate until the channel
//! message paths converge onto the unified thread service, because the
//! channel variants encode a non-optional `channel_id`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A reaction emoji with the list of users who reacted, aggregated from
/// `comms_reactions`.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CountedReaction {
    /// The emoji string.
    pub emoji: String,
    /// User ids who added this reaction.
    pub users: Vec<String>,
}

/// An attachment on a message (`comms_attachments`). The attachment target is
/// polymorphic: `entity_type`/`entity_id` reference any entity.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct MessageAttachment {
    /// Attachment id.
    pub id: Uuid,
    /// Type of attached entity (e.g. "document", "static").
    pub entity_type: String,
    /// Id of the attached entity.
    pub entity_id: String,
    /// Optional width (for images).
    pub width: Option<i32>,
    /// Optional height (for images).
    pub height: Option<i32>,
    /// When the attachment was created.
    pub created_at: DateTime<Utc>,
}

/// A mentioned entity inside a message, mirrored into the source- and
/// target-polymorphic `comms_entity_mentions` table.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
pub struct SimpleMention {
    /// Mentioned entity type (e.g. "user", "document").
    pub entity_type: String,
    /// Mentioned entity id.
    pub entity_id: String,
}

impl std::fmt::Display for SimpleMention {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.entity_type, self.entity_id)
    }
}
