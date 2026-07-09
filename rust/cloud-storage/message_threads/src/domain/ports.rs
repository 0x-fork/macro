//! Ports for the parent-generic thread service.

use std::collections::HashMap;
use std::future::Future;

use channel_sender::ChannelSender;
use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use super::models::{
    CountedReaction, LegacyThreadRef, MessageAttachment, PostThreadMessageRequest,
    PostThreadMessageResponse, ResolvedThreadMessage, SimpleMention, ThreadMessage,
    ThreadMessageRealtime, ThreadMessageRow, ThreadParent, ThreadReactionRealtime,
    ThreadWithReplies, TopLevelThreadRow,
};

/// Errors surfaced by the thread service.
#[derive(Debug, thiserror::Error)]
pub enum ThreadErr {
    /// The referenced thread or message does not exist under this parent.
    #[error("not found: {0}")]
    NotFound(&'static str),
    /// The request is structurally invalid.
    #[error("bad request: {0}")]
    BadRequest(&'static str),
    /// Storage-layer failure.
    #[error(transparent)]
    Repo(#[from] anyhow::Error),
}

/// Persistence port over `comms_messages` + `comms_thread_details` and the
/// message sidecar tables.
pub trait ThreadRepo: Send + Sync + 'static {
    /// Error type for repo operations.
    type Err: Into<anyhow::Error> + Send;

    /// Insert a message under the given parent. `thread_id` must be the id of
    /// a top-level message under the same parent (validated by the service).
    fn create_message(
        &self,
        parent: &ThreadParent,
        sender: ChannelSender<'_>,
        content: String,
        thread_id: Option<Uuid>,
    ) -> impl Future<Output = Result<ThreadMessageRow, Self::Err>> + Send;

    /// Resolve any message id to its parent + root message.
    fn resolve_message(
        &self,
        message_id: Uuid,
    ) -> impl Future<Output = Result<Option<ResolvedThreadMessage>, Self::Err>> + Send;

    /// Fetch top-level threads for a parent, newest first, keyset-paginated
    /// on `created_at`.
    fn get_top_level_threads(
        &self,
        parent: &ThreadParent,
        limit: i64,
        before: Option<DateTime<Utc>>,
    ) -> impl Future<Output = Result<Vec<TopLevelThreadRow>, Self::Err>> + Send;

    /// Fetch a single top-level thread row under a parent.
    fn get_thread(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
    ) -> impl Future<Output = Result<Option<TopLevelThreadRow>, Self::Err>> + Send;

    /// Fetch all active replies of a thread, oldest first.
    fn get_replies(
        &self,
        root_message_id: Uuid,
    ) -> impl Future<Output = Result<Vec<ThreadMessageRow>, Self::Err>> + Send;

    /// Batch-fetch reactions for a set of message ids.
    fn get_reactions_batch(
        &self,
        message_ids: &[Uuid],
    ) -> impl Future<Output = Result<HashMap<Uuid, Vec<CountedReaction>>, Self::Err>> + Send;

    /// Batch-fetch attachments for a set of message ids.
    fn get_attachments_batch(
        &self,
        message_ids: &[Uuid],
    ) -> impl Future<Output = Result<HashMap<Uuid, Vec<MessageAttachment>>, Self::Err>> + Send;

    /// Ensure a `comms_thread_details` row exists for a new top-level thread.
    fn upsert_thread_details(
        &self,
        root_message_id: Uuid,
        mark_id: Option<String>,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Set the resolved flag for a thread. Returns `false` when the thread
    /// has no details row and one was created.
    fn set_thread_resolved(
        &self,
        root_message_id: Uuid,
        resolved: bool,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Add or remove a reaction, returning the updated reaction set for the
    /// message.
    fn set_reaction(
        &self,
        message_id: Uuid,
        user_id: &str,
        emoji: &str,
        active: bool,
    ) -> impl Future<Output = Result<Vec<CountedReaction>, Self::Err>> + Send;

    /// Mirror message mentions into `comms_entity_mentions`.
    fn create_entity_mentions(
        &self,
        message_id: Uuid,
        mentions: &[SimpleMention],
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Resolve a legacy comment thread id to its unified root message.
    fn get_legacy_thread(
        &self,
        legacy_source: &str,
        legacy_thread_id: &str,
    ) -> impl Future<Output = Result<Option<LegacyThreadRef>, Self::Err>> + Send;
}

/// Resolves the realtime/notification audience for a thread parent.
///
/// For channels this is the active participant set; for `entity_access`-backed
/// parents it is every user with access to the entity. Per-parent notification
/// *policy* (who gets an unread badge vs a push) is deliberately not decided
/// here — this is only "who may observe the parent".
pub trait ThreadRecipientResolver: Send + Sync + 'static {
    /// Resolve user ids with access to the parent entity.
    fn recipients(
        &self,
        parent: &ThreadParent,
    ) -> impl Future<Output = Result<Vec<MacroUserIdStr<'static>>, anyhow::Error>> + Send;
}

/// Publishes realtime events for thread mutations.
pub trait ThreadRealtimePublisher: Send + Sync + 'static {
    /// Publish a posted message to the given recipients.
    fn publish_message(
        &self,
        recipients: Vec<MacroUserIdStr<'static>>,
        event: ThreadMessageRealtime,
    ) -> impl Future<Output = Result<(), anyhow::Error>> + Send;

    /// Publish a reaction change to the given recipients.
    fn publish_reaction(
        &self,
        recipients: Vec<MacroUserIdStr<'static>>,
        event: ThreadReactionRealtime,
    ) -> impl Future<Output = Result<(), anyhow::Error>> + Send;
}

/// The parent-generic thread service.
///
/// Authorization contract: handlers authorize against the *parent* entity
/// before calling in (View to read, Comment — or channel membership — to
/// post), mirroring how `channels` handlers authorize via extractors. The
/// service validates structure (reply targets belong to the parent) but not
/// caller identity.
pub trait ThreadService: Send + Sync + 'static {
    /// List top-level threads on a parent entity, newest first.
    fn list_threads(
        &self,
        parent: &ThreadParent,
        limit: i64,
        before: Option<DateTime<Utc>>,
    ) -> impl Future<Output = Result<Vec<ThreadMessage>, ThreadErr>> + Send;

    /// Fetch one thread with all replies.
    fn get_thread(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
    ) -> impl Future<Output = Result<ThreadWithReplies, ThreadErr>> + Send;

    /// Post a top-level message or a reply.
    fn post_message(
        &self,
        actor: ChannelSender<'static>,
        parent: &ThreadParent,
        req: PostThreadMessageRequest,
    ) -> impl Future<Output = Result<PostThreadMessageResponse, ThreadErr>> + Send;

    /// Set the resolved flag on a thread.
    fn set_thread_resolved(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
        resolved: bool,
    ) -> impl Future<Output = Result<(), ThreadErr>> + Send;

    /// Add or remove a reaction on a message under the parent.
    fn set_reaction(
        &self,
        actor: MacroUserIdStr<'static>,
        parent: &ThreadParent,
        message_id: Uuid,
        emoji: String,
        active: bool,
        nonce: Option<String>,
    ) -> impl Future<Output = Result<Vec<CountedReaction>, ThreadErr>> + Send;

    /// Resolve a legacy comment thread reference.
    fn get_legacy_thread(
        &self,
        legacy_source: &str,
        legacy_thread_id: &str,
    ) -> impl Future<Output = Result<Option<LegacyThreadRef>, ThreadErr>> + Send;
}
