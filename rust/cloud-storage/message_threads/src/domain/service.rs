//! Parent-generic thread service implementation.

use std::collections::HashMap;

use channel_sender::ChannelSender;
use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use super::models::{
    CountedReaction, LegacyThreadRef, PostThreadMessageRequest, PostThreadMessageResponse,
    ThreadMessage, ThreadMessageRealtime, ThreadParent, ThreadReactionRealtime, ThreadWithReplies,
};
use super::ports::{
    ThreadErr, ThreadRealtimePublisher, ThreadRecipientResolver, ThreadRepo, ThreadService,
};

/// Maximum page size for thread listings.
const MAX_PAGE_SIZE: i64 = 100;

/// [`ThreadService`] implementation over a [`ThreadRepo`].
///
/// Side effects are deliberately thinner than the channel pipeline for now:
/// realtime fan-out is implemented; notification fan-out, search indexing, and
/// unread activity are follow-ups (see the per-parent policy table in
/// `docs/unified-thread-architecture.md` §3.2). Channel-parented writes should
/// keep flowing through `channels::ChannelService` until those side effects
/// reach parity.
#[derive(Clone)]
pub struct ThreadServiceImpl<R, RT, RC> {
    repo: R,
    realtime: RT,
    recipients: RC,
}

impl<R, RT, RC> ThreadServiceImpl<R, RT, RC>
where
    R: ThreadRepo,
    RT: ThreadRealtimePublisher,
    RC: ThreadRecipientResolver,
{
    /// Create a thread service.
    pub fn new(repo: R, realtime: RT, recipients: RC) -> Self {
        Self {
            repo,
            realtime,
            recipients,
        }
    }

    /// Hydrate reactions + attachments for a set of message ids.
    async fn hydrate_sidecars(
        &self,
        message_ids: &[Uuid],
    ) -> Result<
        (
            HashMap<Uuid, Vec<CountedReaction>>,
            HashMap<Uuid, Vec<super::models::ThreadAttachment>>,
        ),
        ThreadErr,
    > {
        let reactions = self
            .repo
            .get_reactions_batch(message_ids)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;
        let attachments = self
            .repo
            .get_attachments_batch(message_ids)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;
        Ok((reactions, attachments))
    }

    /// Best-effort realtime fan-out to everyone with access to the parent.
    async fn publish_message_realtime(&self, parent: &ThreadParent, event: ThreadMessageRealtime) {
        match self.recipients.recipients(parent).await {
            Ok(recipients) => {
                if let Err(error) = self.realtime.publish_message(recipients, event).await {
                    tracing::error!(?error, "unable to publish thread message realtime event");
                }
            }
            Err(error) => {
                tracing::error!(?error, "unable to resolve thread realtime recipients");
            }
        }
    }
}

impl<R, RT, RC> ThreadService for ThreadServiceImpl<R, RT, RC>
where
    R: ThreadRepo,
    RT: ThreadRealtimePublisher,
    RC: ThreadRecipientResolver,
{
    #[tracing::instrument(err, skip(self))]
    async fn list_threads(
        &self,
        parent: &ThreadParent,
        limit: i64,
        before: Option<DateTime<Utc>>,
    ) -> Result<Vec<ThreadMessage>, ThreadErr> {
        let limit = limit.clamp(1, MAX_PAGE_SIZE);
        let rows = self
            .repo
            .get_top_level_threads(parent, limit, before)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;

        let ids: Vec<Uuid> = rows.iter().map(|r| r.message.id).collect();
        let (mut reactions, mut attachments) = self.hydrate_sidecars(&ids).await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let id = row.message.id;
                row.into_thread_message(
                    reactions.remove(&id).unwrap_or_default(),
                    attachments.remove(&id).unwrap_or_default(),
                )
            })
            .collect())
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_thread(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
    ) -> Result<ThreadWithReplies, ThreadErr> {
        let root = self
            .repo
            .get_thread(parent, root_message_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?
            .ok_or(ThreadErr::NotFound("thread not found"))?;

        let replies = self
            .repo
            .get_replies(root_message_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;

        let mut ids: Vec<Uuid> = replies.iter().map(|r| r.id).collect();
        ids.push(root_message_id);
        let (mut reactions, mut attachments) = self.hydrate_sidecars(&ids).await?;

        let root = root.into_thread_message(
            reactions.remove(&root_message_id).unwrap_or_default(),
            attachments.remove(&root_message_id).unwrap_or_default(),
        );
        let replies = replies
            .into_iter()
            .filter_map(|row| {
                let id = row.id;
                row.into_reply(
                    reactions.remove(&id).unwrap_or_default(),
                    attachments.remove(&id).unwrap_or_default(),
                )
            })
            .collect();

        Ok(ThreadWithReplies { root, replies })
    }

    #[tracing::instrument(err, skip(self, req))]
    async fn post_message(
        &self,
        actor: ChannelSender<'static>,
        parent: &ThreadParent,
        req: PostThreadMessageRequest,
    ) -> Result<PostThreadMessageResponse, ThreadErr> {
        // A reply must target a top-level message under the same parent.
        // Threading is two-level: replying to a reply is rejected rather than
        // silently re-rooted.
        if let Some(thread_id) = req.thread_id {
            let resolved = self
                .repo
                .resolve_message(thread_id)
                .await
                .map_err(|e| ThreadErr::Repo(e.into()))?
                .ok_or(ThreadErr::NotFound("thread not found"))?;
            if resolved.parent_type != parent.db_type() || resolved.parent_id != parent.entity_id {
                return Err(ThreadErr::NotFound("thread not found"));
            }
            if resolved.thread_id != thread_id {
                return Err(ThreadErr::BadRequest(
                    "thread_id must reference a top-level message",
                ));
            }
            if req.mark_id.is_some() {
                return Err(ThreadErr::BadRequest(
                    "mark_id is only valid on new threads",
                ));
            }
        }

        let message = self
            .repo
            .create_message(parent, actor, req.content, req.thread_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;

        // New top-level threads get a details row so resolved-state writes and
        // anchored lookups never need an upsert race later.
        if req.thread_id.is_none()
            && let Err(error) = self
                .repo
                .upsert_thread_details(message.id, req.mark_id.clone())
                .await
        {
            let error: anyhow::Error = error.into();
            tracing::error!(?error, "unable to upsert thread details");
        }

        if !req.mentions.is_empty()
            && let Err(error) = self
                .repo
                .create_entity_mentions(message.id, &req.mentions)
                .await
        {
            let error: anyhow::Error = error.into();
            tracing::error!(?error, "unable to create thread message mentions");
        }

        // TODO(unified-threads): notification fan-out. The recipient *audience*
        // is resolved below for realtime; the notification policy (mention >
        // thread participant > assignee > owner, per docs §6) belongs in a
        // per-parent-type policy port before entity threads notify anyone.
        let response = PostThreadMessageResponse {
            id: message.id,
            thread_id: message.thread_id.unwrap_or(message.id),
            nonce: req.nonce.clone(),
        };

        self.publish_message_realtime(
            parent,
            ThreadMessageRealtime {
                parent_type: parent.db_type().to_string(),
                parent_id: parent.entity_id.clone(),
                message,
                nonce: req.nonce,
            },
        )
        .await;

        Ok(response)
    }

    #[tracing::instrument(err, skip(self))]
    async fn set_thread_resolved(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
        resolved: bool,
    ) -> Result<(), ThreadErr> {
        self.repo
            .get_thread(parent, root_message_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?
            .ok_or(ThreadErr::NotFound("thread not found"))?;

        self.repo
            .set_thread_resolved(root_message_id, resolved)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))
    }

    #[tracing::instrument(err, skip(self))]
    async fn set_reaction(
        &self,
        actor: MacroUserIdStr<'static>,
        parent: &ThreadParent,
        message_id: Uuid,
        emoji: String,
        active: bool,
        nonce: Option<String>,
    ) -> Result<Vec<CountedReaction>, ThreadErr> {
        let resolved = self
            .repo
            .resolve_message(message_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?
            .ok_or(ThreadErr::NotFound("message not found"))?;
        if resolved.parent_type != parent.db_type() || resolved.parent_id != parent.entity_id {
            return Err(ThreadErr::NotFound("message not found"));
        }

        let reactions = self
            .repo
            .set_reaction(message_id, actor.as_ref(), &emoji, active)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))?;

        let event = ThreadReactionRealtime {
            parent_type: parent.db_type().to_string(),
            parent_id: parent.entity_id.clone(),
            message_id,
            reactions: reactions.clone(),
            nonce,
        };
        match self.recipients.recipients(parent).await {
            Ok(recipients) => {
                if let Err(error) = self.realtime.publish_reaction(recipients, event).await {
                    tracing::error!(?error, "unable to publish thread reaction realtime event");
                }
            }
            Err(error) => {
                tracing::error!(?error, "unable to resolve thread realtime recipients");
            }
        }

        Ok(reactions)
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_legacy_thread(
        &self,
        legacy_source: &str,
        legacy_thread_id: &str,
    ) -> Result<Option<LegacyThreadRef>, ThreadErr> {
        self.repo
            .get_legacy_thread(legacy_source, legacy_thread_id)
            .await
            .map_err(|e| ThreadErr::Repo(e.into()))
    }
}
