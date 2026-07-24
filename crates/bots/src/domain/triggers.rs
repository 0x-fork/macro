//! Routing of mention events to agent bots.
//!
//! Consumes `macro.mentions` events (via the inbound Kafka adapter) and
//! decides how each bot mention triggers the mentioned agent:
//!
//! * The system Macro bot and owned `macro`-mode agents run the in-process
//!   [`MacroAgentHandler`].
//! * Owned `external`-mode agents publish a derived `channel.bot-mentioned`
//!   event to the `macro.bots` topic, which webhook ingestion matches against
//!   the owner workspace's webhooks for delivery.

#[cfg(test)]
mod test;

use std::sync::Arc;

use channels::domain::mention_events::{EntityRef, MentionMetadata, MentionTopicEvent};
use channels::domain::ports::ChannelService;
use macro_event_broker::MacroEventBroker;
use uuid::Uuid;

use super::agent::{AgentResponder, BotMentionEvent, MacroAgentHandler};
use super::events::{BotMacroEvent, BotMentionedMetadata};
use super::models::{AgentMode, BotEventKind, BotId};
use super::ports::BotRepo;

/// Entity kind used by message mentions that target a bot.
const BOT_MENTION_ENTITY_KIND: &str = "bot";

/// Entity kind of channel-message mention sources.
const MESSAGE_SOURCE_KIND: &str = "message";

/// How a mention event was handled.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BotMentionOutcome {
    /// The event did not trigger an agent (not a bot mention, unknown bot,
    /// unsubscribed agent, bot not in the channel, bot-authored message, …).
    Skipped,
    /// An in-process Macro agent run was started.
    MacroAgentTriggered,
    /// A derived `channel.bot-mentioned` event was published for delivery to
    /// the external agent's webhook.
    ExternalEventPublished,
}

/// Error handling a mention event.
///
/// Every variant is transient: state could not be loaded or the derived event
/// could not be published, and redelivering the mention may succeed.
#[derive(Debug, thiserror::Error)]
#[error(transparent)]
pub struct BotMentionTriggerError(#[from] anyhow::Error);

/// Resolve the bot targeted by a mention, if any.
///
/// Bot mentions normally arrive tagged `bot`, but Macro AI is surfaced through
/// the user-mention UI, so a `user` mention whose id is exactly the Macro AI
/// bot is recognized as a bot mention too.
///
/// Ids must be in the canonical `bot|<uuid>` principal form; bare UUIDs are
/// rejected (historical bare-UUID content is normalized by migration).
fn mentioned_bot_id(mentioned: &EntityRef) -> Option<BotId> {
    let parsed = bot_id::BotIdStr::parse_from_str(&mentioned.id)
        .ok()
        .map(|id| id.bot_id());
    match mentioned.kind.as_str() {
        BOT_MENTION_ENTITY_KIND => parsed,
        "user" => parsed.filter(|id| *id == bot_id::MACRO_AI_BOT_ID),
        _ => None,
    }
}

/// Domain service that triggers agent bots from mention events.
pub struct BotMentionTriggerService<C, A, R, B> {
    macro_agent: Arc<MacroAgentHandler<C, A>>,
    channels: Arc<C>,
    repo: R,
    event_broker: B,
}

impl<C, A, R: Clone, B: Clone> Clone for BotMentionTriggerService<C, A, R, B> {
    fn clone(&self) -> Self {
        Self {
            macro_agent: Arc::clone(&self.macro_agent),
            channels: Arc::clone(&self.channels),
            repo: self.repo.clone(),
            event_broker: self.event_broker.clone(),
        }
    }
}

impl<C, A, R, B> BotMentionTriggerService<C, A, R, B>
where
    C: ChannelService + 'static,
    A: AgentResponder + Send + Sync + 'static,
    R: BotRepo,
    B: MacroEventBroker,
{
    /// Create a trigger service.
    pub fn new(
        macro_agent: Arc<MacroAgentHandler<C, A>>,
        channels: Arc<C>,
        repo: R,
        event_broker: B,
    ) -> Self {
        Self {
            macro_agent,
            channels,
            repo,
            event_broker,
        }
    }

    /// Handle one decoded `macro.mentions` event.
    #[tracing::instrument(skip(self, event), err)]
    pub async fn handle_event(
        &self,
        event: &MentionTopicEvent,
    ) -> Result<BotMentionOutcome, BotMentionTriggerError> {
        match event {
            MentionTopicEvent::MessageSent(metadata) => self.handle_message_mention(metadata).await,
            // Only channel-message mentions trigger agents today.
            MentionTopicEvent::Created(_) | MentionTopicEvent::Deleted(_) => {
                Ok(BotMentionOutcome::Skipped)
            }
        }
    }

    async fn handle_message_mention(
        &self,
        mention: &MentionMetadata,
    ) -> Result<BotMentionOutcome, BotMentionTriggerError> {
        let Some(bot_id) = mentioned_bot_id(&mention.mentioned) else {
            return Ok(BotMentionOutcome::Skipped);
        };
        if mention.source.kind != MESSAGE_SOURCE_KIND {
            return Ok(BotMentionOutcome::Skipped);
        }
        let Ok(message_id) = Uuid::parse_str(&mention.source.id) else {
            tracing::warn!(source_id = %mention.source.id, "mention source is not a message id");
            return Ok(BotMentionOutcome::Skipped);
        };

        let Some(message) = self
            .channels
            .get_message_by_id(message_id)
            .await
            .map_err(anyhow::Error::from)?
        else {
            tracing::debug!(%message_id, "mentioning message no longer exists");
            return Ok(BotMentionOutcome::Skipped);
        };
        if message.deleted_at.is_some() {
            return Ok(BotMentionOutcome::Skipped);
        }
        // Only user-authored messages trigger bots (bots can't trigger bots).
        let Some(requesting_user) = message.sender_id.as_user().cloned() else {
            return Ok(BotMentionOutcome::Skipped);
        };

        // The system Macro bot is defined in code and has no registry row.
        if bot_id == bot_id::MACRO_AI_BOT_ID {
            self.spawn_macro_agent(
                bot_id,
                bot_id::MACRO_AI_HANDLE.to_string(),
                message,
                requesting_user,
            );
            return Ok(BotMentionOutcome::MacroAgentTriggered);
        }

        let Some(bot) = self
            .repo
            .get_bot(bot_id)
            .await
            .map_err(|err| -> anyhow::Error { err.into() })?
        else {
            return Ok(BotMentionOutcome::Skipped);
        };
        let Some(agent) = bot.agent.clone() else {
            return Ok(BotMentionOutcome::Skipped);
        };
        if !agent.events.contains(&BotEventKind::ChannelBotMentioned) {
            return Ok(BotMentionOutcome::Skipped);
        }
        // Agents only react in channels they were added to.
        if !self
            .repo
            .bot_active_in_channel(message.channel_id, bot_id)
            .await
            .map_err(|err| -> anyhow::Error { err.into() })?
        {
            return Ok(BotMentionOutcome::Skipped);
        }

        match agent.mode {
            AgentMode::Macro => {
                self.spawn_macro_agent(bot_id, bot.handle.clone(), message, requesting_user);
                Ok(BotMentionOutcome::MacroAgentTriggered)
            }
            AgentMode::External => {
                let owner = bot
                    .owner
                    .clone()
                    .ok_or_else(|| anyhow::anyhow!("owned agent bot has no owner"))?;
                let event = BotMacroEvent::mentioned(BotMentionedMetadata {
                    bot_id,
                    owner,
                    channel_id: message.channel_id,
                    message_id: message.id,
                    thread_id: message.thread_id,
                    mentioned_by: requesting_user,
                    content: message.content,
                    mentioned_at: message.created_at,
                });
                // Await the publish so the mention is redelivered (not lost)
                // when the broker is unavailable.
                self.event_broker
                    .send_event(&event)
                    .map_err(anyhow::Error::from)?
                    .await
                    .map_err(anyhow::Error::from)?
                    .map_err(anyhow::Error::from)?;
                Ok(BotMentionOutcome::ExternalEventPublished)
            }
        }
    }

    /// Run the in-process Macro agent on a spawned task.
    ///
    /// Dispatch is fire-and-forget so a long agent run never blocks mention
    /// consumption; failures are logged by the handler.
    fn spawn_macro_agent(
        &self,
        bot_id: BotId,
        bot_handle: String,
        message: channels::domain::models::MutatedMessage,
        requesting_user: macro_user_id::user_id::MacroUserIdStr<'static>,
    ) {
        let event = BotMentionEvent {
            bot_id,
            bot_handle,
            channel_id: message.channel_id,
            reply_thread_id: message.thread_id.unwrap_or(message.id),
            message,
            requesting_user,
        };
        let handler = Arc::clone(&self.macro_agent);
        tokio::spawn(async move {
            let _ = handler.handle(&event).await.inspect_err(
                |err| tracing::error!(error=?err, bot_id = %event.bot_id, "macro agent run failed"),
            );
        });
    }
}
