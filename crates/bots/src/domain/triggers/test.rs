use std::sync::{Arc, Mutex};

use channels::domain::models::{
    AttachmentEntityReference, ChannelAttachmentType, ChannelContextMessage, ChannelMessageFilters,
    ChannelParticipant, MessagePageDirection, MutatedMessage, Sender, ThreadReply,
};
use channels::domain::ports::{
    ChannelAttachmentsPage, ChannelMessagesErr, ChannelMessagesQueryResult, ChannelService,
};
use chrono::Utc;
use macro_event_broker::{EventBrokerError, MacroEvent, MacroEventBroker};
use macro_user_id::user_id::MacroUserIdStr;
use models_pagination::{CreatedAt, Query};
use uuid::Uuid;

use super::*;
use crate::domain::agent::AgentResponder;
use crate::domain::models::{
    AgentConfig, Bot, BotChannel, BotKind, BotOwner, BotToken, BotTokenCandidate, BotType,
    CreateBotRequest, CreateBotTokenRequest, CreateChannelScopedBotRequest, PatchBotRequest,
};
use crate::domain::ports::BotRepo;

/// Channel service fake that serves a single message by id.
struct FakeChannelService {
    message: Option<MutatedMessage>,
}

impl ChannelService for FakeChannelService {
    fn get_channel_messages(
        &self,
        _channel_id: Uuid,
        _query: Query<Uuid, CreatedAt, ()>,
        _direction: MessagePageDirection,
        _limit: u16,
        _filters: &ChannelMessageFilters,
        _notification_user_id: Option<MacroUserIdStr<'static>>,
    ) -> impl Future<Output = Result<ChannelMessagesQueryResult, ChannelMessagesErr>> + Send {
        async move { unimplemented!("not needed for trigger tests") }
    }

    fn get_channel_attachments(
        &self,
        _channel_id: Uuid,
        _query: Query<Uuid, CreatedAt, ()>,
        _limit: u16,
        _attachment_type: Option<ChannelAttachmentType>,
    ) -> impl Future<Output = Result<ChannelAttachmentsPage, ChannelMessagesErr>> + Send {
        async move { unimplemented!("not needed for trigger tests") }
    }

    fn get_channel_participants(
        &self,
        _channel_id: Uuid,
    ) -> impl Future<Output = Result<Vec<ChannelParticipant>, ChannelMessagesErr>> + Send {
        async move { unimplemented!("not needed for trigger tests") }
    }

    fn get_message_by_id(
        &self,
        _message_id: Uuid,
    ) -> impl Future<Output = Result<Option<MutatedMessage>, ChannelMessagesErr>> + Send {
        let message = self.message.clone();
        async move { Ok(message) }
    }

    fn get_attachment_references(
        &self,
        _entity_type: String,
        _entity_id: String,
        _user_id: String,
    ) -> impl Future<Output = Result<Vec<AttachmentEntityReference>, ChannelMessagesErr>> + Send
    {
        async move { unimplemented!("not needed for trigger tests") }
    }

    fn get_channel_messages_around(
        &self,
        _channel_id: Uuid,
        _message_id: Uuid,
        _limit: u16,
    ) -> impl Future<Output = Result<ChannelMessagesQueryResult, ChannelMessagesErr>> + Send {
        async move { unimplemented!("not needed for trigger tests") }
    }

    fn get_thread_replies(
        &self,
        _channel_id: Uuid,
        _message_id: Uuid,
    ) -> impl Future<Output = Result<Vec<ThreadReply>, ChannelMessagesErr>> + Send {
        async move { Ok(Vec::new()) }
    }

    fn get_message_context(
        &self,
        _channel_id: Uuid,
        _message_id: Uuid,
        _before: i64,
        _after: i64,
    ) -> impl Future<Output = Result<Vec<ChannelContextMessage>, ChannelMessagesErr>> + Send {
        async move { Ok(Vec::new()) }
    }
}

struct FakeResponder;

#[async_trait::async_trait]
impl AgentResponder for FakeResponder {
    async fn respond(&self, _user_id: &str, _prompt: String) -> anyhow::Result<String> {
        Ok(String::new())
    }
}

/// Bot repo fake serving a single bot and a fixed channel-membership answer.
#[derive(Clone)]
struct FakeBotRepo {
    bot: Option<Bot>,
    active_in_channel: bool,
}

impl BotRepo for FakeBotRepo {
    type Err = anyhow::Error;

    async fn create_owned_bot(
        &self,
        _bot_id: BotId,
        _owner: BotOwner,
        _created_by: MacroUserIdStr<'static>,
        _req: CreateBotRequest,
        _agent: Option<AgentConfig>,
    ) -> Result<Bot, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn create_channel_scoped_bot(
        &self,
        _owner: BotOwner,
        _created_by: MacroUserIdStr<'static>,
        _channel_id: Uuid,
        _token: String,
        _req: CreateChannelScopedBotRequest,
    ) -> Result<(Bot, BotToken), Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn list_manageable_bots(
        &self,
        _caller: MacroUserIdStr<'static>,
    ) -> Result<Vec<Bot>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn get_bot(&self, _bot_id: BotId) -> Result<Option<Bot>, Self::Err> {
        Ok(self.bot.clone())
    }

    async fn user_has_team(
        &self,
        _caller: MacroUserIdStr<'static>,
        _team_id: Uuid,
    ) -> Result<bool, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn bot_active_in_channel(
        &self,
        _channel_id: Uuid,
        _bot_id: BotId,
    ) -> Result<bool, Self::Err> {
        Ok(self.active_in_channel)
    }

    async fn user_can_administer_team(
        &self,
        _caller: MacroUserIdStr<'static>,
        _team_id: Uuid,
    ) -> Result<bool, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn patch_bot(
        &self,
        _bot_id: BotId,
        _req: PatchBotRequest,
    ) -> Result<Option<Bot>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn delete_bot(&self, _bot_id: BotId) -> Result<bool, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn add_bot_to_channel(&self, _channel_id: Uuid, _bot_id: BotId) -> Result<(), Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn remove_bot_from_channel(
        &self,
        _channel_id: Uuid,
        _bot_id: BotId,
    ) -> Result<bool, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn list_bot_channels(&self, _bot_id: BotId) -> Result<Vec<BotChannel>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn list_channel_bots(&self, _channel_id: Uuid) -> Result<Vec<Bot>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn create_token(
        &self,
        _bot_id: BotId,
        _token: String,
        _req: CreateBotTokenRequest,
    ) -> Result<BotToken, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn list_tokens(&self, _bot_id: BotId) -> Result<Vec<BotToken>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn revoke_token(&self, _bot_id: BotId, _token_id: Uuid) -> Result<bool, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn token_candidate(&self, _token: &str) -> Result<Option<BotTokenCandidate>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn channel_token_candidate(
        &self,
        _channel_id: Uuid,
        _token: &str,
    ) -> Result<Option<BotTokenCandidate>, Self::Err> {
        unimplemented!("not needed for trigger tests")
    }

    async fn mark_token_used(&self, _token_id: Uuid) -> Result<(), Self::Err> {
        unimplemented!("not needed for trigger tests")
    }
}

/// Captured publication: topic, key, and serialized envelope.
#[derive(Clone, Default)]
struct CapturingBroker {
    published: Arc<Mutex<Vec<(String, String, serde_json::Value)>>>,
}

impl MacroEventBroker for CapturingBroker {
    fn send_event<E: MacroEvent + ?Sized>(
        &self,
        event: &E,
    ) -> Result<tokio::task::JoinHandle<Result<(), EventBrokerError>>, EventBrokerError> {
        let payload = serde_json::to_value(event.event())?;
        self.published.lock().unwrap().push((
            event.topic().to_string(),
            event.key().to_string(),
            payload,
        ));
        Ok(tokio::spawn(async { Ok(()) }))
    }
}

fn user_id(email: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from(format!("macro|{email}")).unwrap()
}

fn message(channel_id: Uuid, id: Uuid, sender: Sender, content: &str) -> MutatedMessage {
    let now = Utc::now();
    MutatedMessage {
        id,
        channel_id,
        thread_id: None,
        sender_id: sender,
        triggered_by: None,
        content: content.to_string(),
        created_at: now,
        updated_at: now,
        edited_at: None,
        deleted_at: None,
    }
}

fn agent_bot(bot_id: BotId, mode: AgentMode, owner: BotOwner) -> Bot {
    let now = Utc::now();
    Bot {
        id: bot_id,
        kind: BotKind::Owned,
        bot_type: BotType::Agent,
        agent: Some(AgentConfig {
            mode,
            events: vec![BotEventKind::ChannelBotMentioned],
            webhook_id: (mode == AgentMode::External).then(|| "wh_test".to_string()),
        }),
        owner: Some(owner),
        name: "Helper".to_string(),
        handle: "helper".to_string(),
        description: None,
        avatar_url: None,
        created_by: None,
        created_at: now,
        updated_at: now,
        deleted_at: None,
    }
}

struct Setup {
    service:
        BotMentionTriggerService<FakeChannelService, FakeResponder, FakeBotRepo, CapturingBroker>,
    broker: CapturingBroker,
}

fn setup(message: Option<MutatedMessage>, bot: Option<Bot>, active_in_channel: bool) -> Setup {
    let channels = Arc::new(FakeChannelService { message });
    let handler = Arc::new(MacroAgentHandler::new(
        Arc::clone(&channels),
        Arc::new(FakeResponder),
    ));
    let broker = CapturingBroker::default();
    let service = BotMentionTriggerService::new(
        handler,
        channels,
        FakeBotRepo {
            bot,
            active_in_channel,
        },
        broker.clone(),
    );
    Setup { service, broker }
}

fn message_sent(mentioned_kind: &str, mentioned_id: &str, message_id: Uuid) -> MentionTopicEvent {
    MentionTopicEvent::MessageSent(MentionMetadata {
        source: EntityRef {
            id: message_id.to_string(),
            kind: "message".to_string(),
        },
        mentioned: EntityRef {
            id: mentioned_id.to_string(),
            kind: mentioned_kind.to_string(),
        },
    })
}

#[test]
fn mentioned_bot_id_recognizes_bot_and_macro_ai_user_tags() {
    let macro_ai = bot_id::MACRO_AI_BOT_ID.into_storage_id().to_string();
    let other_bot = BotId::new_from_uuid(Uuid::new_v4());
    let other_bot_principal = other_bot.into_storage_id().to_string();

    let entity = |kind: &str, id: &str| EntityRef {
        id: id.to_string(),
        kind: kind.to_string(),
    };

    // Macro AI surfaced through the user-mention UI.
    assert_eq!(
        mentioned_bot_id(&entity("user", &macro_ai)),
        Some(bot_id::MACRO_AI_BOT_ID)
    );
    // A real user mention is ignored.
    assert_eq!(
        mentioned_bot_id(&entity("user", "macro|teo@macro.com")),
        None
    );
    // An explicitly bot-tagged mention.
    assert_eq!(
        mentioned_bot_id(&entity("bot", &other_bot_principal)),
        Some(other_bot)
    );
    // A non-Macro bot surfaced as a user mention is not a bot mention.
    assert_eq!(
        mentioned_bot_id(&entity("user", &other_bot_principal)),
        None
    );
    // Bare UUIDs are a legacy encoding; producers must send `bot|<uuid>`.
    assert_eq!(
        mentioned_bot_id(&entity("bot", &other_bot.as_uuid().to_string())),
        None
    );
    // Other entity kinds never trigger bots.
    assert_eq!(
        mentioned_bot_id(&entity("document", &other_bot_principal)),
        None
    );
}

#[tokio::test]
async fn external_agent_mention_publishes_derived_event() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let channel_id = Uuid::new_v4();
    let message_id = Uuid::new_v4();
    let owner = BotOwner::Team {
        team_id: Uuid::new_v4(),
    };
    let sent = message(
        channel_id,
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@helper summarize this",
    );
    let harness = setup(
        Some(sent),
        Some(agent_bot(bot_id, AgentMode::External, owner.clone())),
        true,
    );

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::ExternalEventPublished);
    let published = harness.broker.published.lock().unwrap().clone();
    assert_eq!(published.len(), 1);
    let (topic, key, payload) = &published[0];
    assert_eq!(topic, "macro.bots");
    assert_eq!(key, &bot_id.to_string());
    assert_eq!(payload["event_type"], "channel.bot-mentioned");
    let metadata = &payload["metadata"];
    assert_eq!(metadata["channel_id"], channel_id.to_string());
    assert_eq!(metadata["message_id"], message_id.to_string());
    assert_eq!(metadata["mentioned_by"], "macro|teo@example.com");
    assert_eq!(metadata["content"], "@helper summarize this");
    let BotOwner::Team { team_id } = owner else {
        unreachable!()
    };
    assert_eq!(metadata["owner"]["team_id"], team_id.to_string());
}

#[tokio::test]
async fn macro_ai_mention_triggers_macro_agent_without_a_registry_row() {
    let channel_id = Uuid::new_v4();
    let message_id = Uuid::new_v4();
    let sent = message(
        channel_id,
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@macro help",
    );
    // The repo would panic if consulted: the system bot has no registry row.
    let harness = setup(Some(sent), None, false);

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "user",
            &bot_id::MACRO_AI_BOT_ID.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::MacroAgentTriggered);
    assert!(harness.broker.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn macro_mode_agent_mention_triggers_macro_agent() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let channel_id = Uuid::new_v4();
    let message_id = Uuid::new_v4();
    let sent = message(
        channel_id,
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@helper help",
    );
    let owner = BotOwner::User {
        user_id: "macro|owner@example.com".to_string(),
    };
    let harness = setup(
        Some(sent),
        Some(agent_bot(bot_id, AgentMode::Macro, owner)),
        true,
    );

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::MacroAgentTriggered);
    assert!(harness.broker.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn unknown_bot_mention_is_skipped() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let message_id = Uuid::new_v4();
    let sent = message(
        Uuid::new_v4(),
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@ghost help",
    );
    let harness = setup(Some(sent), None, true);

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::Skipped);
}

#[tokio::test]
async fn standard_bot_mention_is_skipped() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let message_id = Uuid::new_v4();
    let sent = message(
        Uuid::new_v4(),
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@webhookbot ping",
    );
    let mut bot = agent_bot(
        bot_id,
        AgentMode::Macro,
        BotOwner::User {
            user_id: "macro|owner@example.com".to_string(),
        },
    );
    bot.bot_type = BotType::Standard;
    bot.agent = None;
    let harness = setup(Some(sent), Some(bot), true);

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::Skipped);
}

#[tokio::test]
async fn agent_outside_the_channel_is_skipped() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let message_id = Uuid::new_v4();
    let sent = message(
        Uuid::new_v4(),
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@helper help",
    );
    let harness = setup(
        Some(sent),
        Some(agent_bot(
            bot_id,
            AgentMode::External,
            BotOwner::User {
                user_id: "macro|owner@example.com".to_string(),
            },
        )),
        false,
    );

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::Skipped);
    assert!(harness.broker.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn bot_authored_messages_never_trigger_bots() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let message_id = Uuid::new_v4();
    let sent = message(
        Uuid::new_v4(),
        message_id,
        Sender::new_from_bot(bot_id::MACRO_AI_BOT_ID),
        "@helper look at this",
    );
    let harness = setup(Some(sent), None, true);

    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();

    assert_eq!(outcome, BotMentionOutcome::Skipped);
}

#[tokio::test]
async fn deleted_or_missing_messages_are_skipped() {
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    let message_id = Uuid::new_v4();

    // Missing message.
    let harness = setup(None, None, true);
    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();
    assert_eq!(outcome, BotMentionOutcome::Skipped);

    // Deleted message.
    let mut sent = message(
        Uuid::new_v4(),
        message_id,
        Sender::new_from_user(user_id("teo@example.com")),
        "@helper help",
    );
    sent.deleted_at = Some(Utc::now());
    let harness = setup(Some(sent), None, true);
    let outcome = harness
        .service
        .handle_event(&message_sent(
            "bot",
            &bot_id.into_storage_id().to_string(),
            message_id,
        ))
        .await
        .unwrap();
    assert_eq!(outcome, BotMentionOutcome::Skipped);
}

#[tokio::test]
async fn non_message_mention_events_are_skipped() {
    let harness = setup(None, None, true);

    let created = MentionTopicEvent::Created(MentionMetadata {
        source: EntityRef {
            id: Uuid::new_v4().to_string(),
            kind: "doc".to_string(),
        },
        mentioned: EntityRef {
            id: bot_id::MACRO_AI_BOT_ID.into_storage_id().to_string(),
            kind: "bot".to_string(),
        },
    });
    assert_eq!(
        harness.service.handle_event(&created).await.unwrap(),
        BotMentionOutcome::Skipped
    );

    // A message_sent mention whose source is not a message.
    let doc_source = MentionTopicEvent::MessageSent(MentionMetadata {
        source: EntityRef {
            id: Uuid::new_v4().to_string(),
            kind: "doc".to_string(),
        },
        mentioned: EntityRef {
            id: bot_id::MACRO_AI_BOT_ID.into_storage_id().to_string(),
            kind: "bot".to_string(),
        },
    });
    assert_eq!(
        harness.service.handle_event(&doc_source).await.unwrap(),
        BotMentionOutcome::Skipped
    );

    // A mention that does not target a bot at all.
    let user_mention = message_sent("user", "macro|teo@macro.com", Uuid::new_v4());
    assert_eq!(
        harness.service.handle_event(&user_mention).await.unwrap(),
        BotMentionOutcome::Skipped
    );
}
