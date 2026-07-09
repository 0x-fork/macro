//! Domain models for parent-generic message threads.
//!
//! These deliberately mirror the shapes in `channels::domain::models` (which
//! remain the source of truth for the channel-parented surface). Once the
//! `channels` crate delegates its message paths to this crate, the channel
//! copies retire.

use chrono::{DateTime, Utc};
use model_entity::EntityType;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// The entity a message thread hangs off.
///
/// Persisted as the soft `(parent_type, parent_id)` varchar pair on
/// `comms_messages`, matching the repo-wide cross-domain reference convention
/// (`comms_attachments`, `comms_entity_mentions`, `entity_properties`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ThreadParent {
    /// Entity type of the parent.
    pub entity_type: EntityType,
    /// Entity id of the parent.
    pub entity_id: String,
}

/// Error returned for entity types that cannot parent a thread.
#[derive(Debug, thiserror::Error)]
#[error("entity type {0:?} cannot parent a message thread")]
pub struct InvalidThreadParent(pub EntityType);

impl ThreadParent {
    /// Build a validated thread parent.
    ///
    /// Rejects entity types that can never parent a thread: users and teams
    /// are principals, not content; a `ChannelMessage` is itself a thread
    /// (threading is two-level by design); static files are unowned public
    /// blobs.
    pub fn new(
        entity_type: EntityType,
        entity_id: impl Into<String>,
    ) -> Result<Self, InvalidThreadParent> {
        match entity_type {
            EntityType::Channel
            | EntityType::Document
            | EntityType::Project
            | EntityType::Chat
            | EntityType::EmailThread
            | EntityType::Call
            | EntityType::ForeignEntity
            | EntityType::CrmCompany
            | EntityType::CrmContact => Ok(Self {
                entity_type,
                entity_id: entity_id.into(),
            }),
            EntityType::User
            | EntityType::Team
            | EntityType::ChannelMessage
            | EntityType::StaticFile => Err(InvalidThreadParent(entity_type)),
        }
    }

    /// The snake_case string persisted in `comms_messages.parent_type`.
    pub fn db_type(&self) -> &'static str {
        self.entity_type.into()
    }

    /// The channel uuid when the parent is a channel.
    ///
    /// Channel-parented rows keep the denormalized `channel_id` column
    /// populated so the `ON DELETE CASCADE` from `comms_channels` and the
    /// legacy channel indexes keep working.
    pub fn channel_uuid(&self) -> Option<Uuid> {
        if self.entity_type == EntityType::Channel {
            Uuid::parse_str(&self.entity_id).ok()
        } else {
            None
        }
    }
}

pub use models_comms::{CountedReaction, MessageAttachment, SimpleMention};

/// Thread-level state channels never needed, from `comms_thread_details`.
#[derive(Debug, Clone, Default, Serialize, utoipa::ToSchema)]
pub struct ThreadDetails {
    /// Whether the thread is resolved (document comment semantics).
    pub resolved: bool,
    /// Lexical anchor mark id for document-anchored threads. `None` for
    /// unanchored ("discussion") threads and for channel threads. This
    /// replaces the legacy `DISCUSSION:` markId sentinel.
    pub mark_id: Option<String>,
}

/// A top-level thread message with thread stats and hydrated sidecars.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ThreadMessage {
    /// Message id. Doubles as the thread id for its replies.
    pub id: Uuid,
    /// Parent entity type (snake_case).
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
    /// Sender actor id (user id or `bot|<uuid>`).
    pub sender_id: String,
    /// For an agent (bot) message, the user who triggered it.
    pub triggered_by: Option<String>,
    /// Message body (markdown with `<m-*-mention>` markup).
    pub content: String,
    /// Created timestamp.
    pub created_at: DateTime<Utc>,
    /// Updated timestamp.
    pub updated_at: DateTime<Utc>,
    /// Edited timestamp.
    pub edited_at: Option<DateTime<Utc>>,
    /// Number of active replies.
    pub reply_count: i64,
    /// Timestamp of the most recent reply.
    pub latest_reply_at: Option<DateTime<Utc>>,
    /// Thread-level details (resolved flag, anchor mark id).
    pub details: ThreadDetails,
    /// Aggregated reactions.
    pub reactions: Vec<CountedReaction>,
    /// Attachments.
    pub attachments: Vec<MessageAttachment>,
}

/// A reply inside a thread.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ThreadReplyMessage {
    /// Reply id.
    pub id: Uuid,
    /// The thread (root message) this reply belongs to.
    pub thread_id: Uuid,
    /// Sender actor id.
    pub sender_id: String,
    /// For an agent (bot) reply, the user who triggered it.
    pub triggered_by: Option<String>,
    /// Reply body.
    pub content: String,
    /// Created timestamp.
    pub created_at: DateTime<Utc>,
    /// Updated timestamp.
    pub updated_at: DateTime<Utc>,
    /// Edited timestamp.
    pub edited_at: Option<DateTime<Utc>>,
    /// Aggregated reactions.
    pub reactions: Vec<CountedReaction>,
    /// Attachments.
    pub attachments: Vec<MessageAttachment>,
}

/// A thread with all of its replies.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ThreadWithReplies {
    /// The root message.
    pub root: ThreadMessage,
    /// All active replies, oldest first.
    pub replies: Vec<ThreadReplyMessage>,
}

/// Raw message row shared by the repo read paths. Serialized as the realtime
/// payload body.
#[derive(Debug, Clone, Serialize)]
pub struct ThreadMessageRow {
    /// Message id.
    pub id: Uuid,
    /// Parent entity type.
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
    /// Thread (root message) id for replies, `None` for top-level messages.
    pub thread_id: Option<Uuid>,
    /// Sender actor id.
    pub sender_id: String,
    /// Triggering user for bot messages.
    pub triggered_by: Option<String>,
    /// Message body.
    pub content: String,
    /// Created timestamp.
    pub created_at: DateTime<Utc>,
    /// Updated timestamp.
    pub updated_at: DateTime<Utc>,
    /// Edited timestamp.
    pub edited_at: Option<DateTime<Utc>>,
    /// Soft-delete timestamp.
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Raw top-level row with thread stats and details, before sidecar hydration.
#[derive(Debug, Clone)]
pub struct TopLevelThreadRow {
    /// The message row.
    pub message: ThreadMessageRow,
    /// Number of active replies.
    pub reply_count: i64,
    /// Timestamp of the most recent reply.
    pub latest_reply_at: Option<DateTime<Utc>>,
    /// Resolved flag from `comms_thread_details` (false when absent).
    pub resolved: bool,
    /// Anchor mark id from `comms_thread_details`.
    pub mark_id: Option<String>,
}

/// Resolution metadata for any message id.
#[derive(Debug, Clone)]
pub struct ResolvedThreadMessage {
    /// The requested message id.
    pub message_id: Uuid,
    /// Parent entity type.
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
    /// The root message id. Equals `message_id` for top-level messages.
    pub thread_id: Uuid,
}

/// A legacy comment thread reference resolved from `comms_thread_details`.
///
/// Serves deep links and notification metadata that still carry the old
/// numeric annotation ids (or crm uuids) after the comment backfill.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct LegacyThreadRef {
    /// The unified root message id.
    pub root_message_id: Uuid,
    /// Parent entity type.
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
}

/// Request body for posting a thread message.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct PostThreadMessageRequest {
    /// Message body.
    pub content: String,
    /// Reply target: the root message id of an existing thread. `None`
    /// creates a new top-level thread on the parent entity.
    #[serde(default)]
    pub thread_id: Option<Uuid>,
    /// Mentioned entities.
    #[serde(default)]
    pub mentions: Vec<SimpleMention>,
    /// Lexical anchor mark id, only meaningful when creating a new top-level
    /// thread on a document. `None` = unanchored (discussion) thread.
    #[serde(default)]
    pub mark_id: Option<String>,
    /// Optional optimistic-update nonce echoed on the realtime event.
    #[serde(default)]
    pub nonce: Option<String>,
}

/// Response returned after posting a thread message.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct PostThreadMessageResponse {
    /// Created message id.
    pub id: Uuid,
    /// The thread (root message) id the message belongs to.
    pub thread_id: Uuid,
    /// Optional optimistic-update nonce.
    pub nonce: Option<String>,
}

/// Request body for setting the resolved state of a thread.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct SetThreadResolvedRequest {
    /// The new resolved state.
    pub resolved: bool,
}

/// Request body for setting/unsetting a reaction on a message.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct SetReactionRequest {
    /// The emoji to react with.
    pub emoji: String,
    /// `true` adds the reaction, `false` removes it.
    pub active: bool,
    /// Optional optimistic-update nonce echoed on the realtime event.
    #[serde(default)]
    pub nonce: Option<String>,
}

/// Realtime payload for a posted thread message, published to everyone with
/// access to the parent entity as message type `thread_message`.
#[derive(Debug, Clone, Serialize)]
pub struct ThreadMessageRealtime {
    /// Parent entity type.
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
    /// The message.
    pub message: ThreadMessageRow,
    /// Optional optimistic-update nonce.
    pub nonce: Option<String>,
}

/// Realtime payload for a reaction change, published as `thread_reaction`.
#[derive(Debug, Clone, Serialize)]
pub struct ThreadReactionRealtime {
    /// Parent entity type.
    pub parent_type: String,
    /// Parent entity id.
    pub parent_id: String,
    /// The message the reaction is on.
    pub message_id: Uuid,
    /// Full updated reaction set for the message.
    pub reactions: Vec<CountedReaction>,
    /// Optional optimistic-update nonce.
    pub nonce: Option<String>,
}

impl ThreadMessageRow {
    /// Convert a raw row into the API reply shape.
    pub fn into_reply(
        self,
        reactions: Vec<CountedReaction>,
        attachments: Vec<MessageAttachment>,
    ) -> Option<ThreadReplyMessage> {
        Some(ThreadReplyMessage {
            id: self.id,
            thread_id: self.thread_id?,
            sender_id: self.sender_id,
            triggered_by: self.triggered_by,
            content: self.content,
            created_at: self.created_at,
            updated_at: self.updated_at,
            edited_at: self.edited_at,
            reactions,
            attachments,
        })
    }
}

impl TopLevelThreadRow {
    /// Convert a raw top-level row into the API thread shape.
    pub fn into_thread_message(
        self,
        reactions: Vec<CountedReaction>,
        attachments: Vec<MessageAttachment>,
    ) -> ThreadMessage {
        ThreadMessage {
            id: self.message.id,
            parent_type: self.message.parent_type,
            parent_id: self.message.parent_id,
            sender_id: self.message.sender_id,
            triggered_by: self.message.triggered_by,
            content: self.message.content,
            created_at: self.message.created_at,
            updated_at: self.message.updated_at,
            edited_at: self.message.edited_at,
            reply_count: self.reply_count,
            latest_reply_at: self.latest_reply_at,
            details: ThreadDetails {
                resolved: self.resolved,
                mark_id: self.mark_id,
            },
            reactions,
            attachments,
        }
    }
}
