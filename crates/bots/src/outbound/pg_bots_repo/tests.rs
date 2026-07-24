use super::*;
use crate::domain::{
    models::{
        AgentMode, BotChannelType, BotEventKind, BotType, CreateAgentConfigRequest,
        CreateBotRequest, CreateBotTokenRequest, CreateChannelScopedBotRequest, PatchBotRequest,
    },
    ports::{BotError, BotService},
    service::BotServiceImpl,
    test_support::{FAKE_AGENT_WEBHOOK_ID, FakeAgentWebhookProvisioner},
};
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_event_broker::{EventBrokerError, MacroEvent, MacroEventBroker, NoopMacroEventBroker};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::sync::{Arc, Mutex};

const USER_OWNER: &str = "macro|bot-owner@example.com";
const USER_OTHER: &str = "macro|bot-other@example.com";
const TEAM_MEMBER: &str = "macro|bot-team-member@example.com";
const TEAM_ADMIN: &str = "macro|bot-team-admin@example.com";
const TEAM_OWNER: &str = "macro|bot-team-owner@example.com";
const TEAM_OTHER: &str = "macro|bot-team-other@example.com";
fn user_id(value: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from(value.to_string()).expect("valid macro user id")
}

fn create_req(handle: &str) -> CreateBotRequest {
    CreateBotRequest {
        team_id: None,
        name: "Datadog Alerts".to_string(),
        handle: handle.to_string(),
        description: Some("Posts alarm notifications".to_string()),
        avatar_url: None,
        agent: None,
    }
}

fn create_channel_scoped_req(handle: &str) -> CreateChannelScopedBotRequest {
    CreateChannelScopedBotRequest {
        team_id: None,
        name: "Datadog Alerts".to_string(),
        handle: handle.to_string(),
        description: Some("Posts alarm notifications".to_string()),
        avatar_url: None,
        token_label: Some("Webhook".to_string()),
        token_expires_at: None,
    }
}

fn service(
    pool: &PgPool,
) -> BotServiceImpl<PgBotsRepo, NoopMacroEventBroker, FakeAgentWebhookProvisioner> {
    BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        NoopMacroEventBroker,
        FakeAgentWebhookProvisioner::default(),
    )
}

#[derive(Clone, Debug)]
struct PublishedEvent {
    topic: &'static str,
    key: String,
    payload: Value,
}

#[derive(Clone, Default)]
struct RecordingEventBroker {
    published: Arc<Mutex<Vec<PublishedEvent>>>,
    fail_scheduling: bool,
}

impl RecordingEventBroker {
    fn failing() -> Self {
        Self {
            fail_scheduling: true,
            ..Self::default()
        }
    }

    fn events(&self) -> Vec<PublishedEvent> {
        self.published.lock().expect("event lock poisoned").clone()
    }

    fn clear(&self) {
        self.published.lock().expect("event lock poisoned").clear();
    }
}

impl MacroEventBroker for RecordingEventBroker {
    fn send_event<E: MacroEvent + ?Sized>(
        &self,
        event: &E,
    ) -> Result<tokio::task::JoinHandle<Result<(), EventBrokerError>>, EventBrokerError> {
        if self.fail_scheduling {
            return Err(EventBrokerError::Publish(
                "intentional scheduling failure".to_string(),
            ));
        }

        self.published
            .lock()
            .expect("event lock poisoned")
            .push(PublishedEvent {
                topic: event.topic(),
                key: event.key().to_string(),
                payload: serde_json::to_value(event.event())?,
            });
        Ok(tokio::spawn(async { Ok(()) }))
    }
}

fn recording_service(
    pool: &PgPool,
    broker: RecordingEventBroker,
) -> BotServiceImpl<PgBotsRepo, RecordingEventBroker, FakeAgentWebhookProvisioner> {
    BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        broker,
        FakeAgentWebhookProvisioner::default(),
    )
}

fn assert_event(event: &PublishedEvent, bot_id: BotId, event_type: &str, metadata: Value) {
    assert_eq!(event.topic, "macro.bots");
    assert_eq!(event.key, bot_id.to_string());
    assert_eq!(event.payload["schema_version"], 1);
    assert_eq!(event.payload["event_type"], event_type);
    assert_eq!(event.payload["metadata"], metadata);
}

fn assert_no_token_material(payload: &Value, known_token: Option<&str>) {
    let serialized = serde_json::to_string(payload).expect("event serializes");
    if let Some(known_token) = known_token {
        assert!(!serialized.contains(known_token));
    }
    for forbidden_field in [
        "token",
        "bot_token",
        "bearer_token",
        "token_id",
        "token_hash",
        "token_prefix",
        "token_label",
        "label",
        "token_expires_at",
        "expires_at",
        "last_used_at",
        "revoked_at",
    ] {
        assert!(!serialized.contains(&format!("\"{forbidden_field}\"")));
    }
}

async fn insert_user(pool: &PgPool, user_id: &str) -> anyhow::Result<()> {
    let macro_user_id = Uuid::new_v4();
    let email = user_id.strip_prefix("macro|").unwrap_or(user_id);
    let stripe_customer_id = format!("stripe_{macro_user_id}");

    sqlx::query(
        r#"
        INSERT INTO macro_user (id, username, email, stripe_customer_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(macro_user_id)
    .bind(email)
    .bind(email)
    .bind(stripe_customer_id)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO "User" (id, email, macro_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(email)
    .bind(macro_user_id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn insert_team_user(
    pool: &PgPool,
    team_id: Uuid,
    user_id: &str,
    role: &str,
) -> anyhow::Result<()> {
    insert_user(pool, user_id).await?;
    sqlx::query!(
        r#"
        INSERT INTO team (id, name, owner_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
        "#,
        team_id,
        "Platform",
        user_id,
    )
    .execute(pool)
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO team_user (user_id, team_id, team_role)
        VALUES ($1, $2, $3::text::team_role)
        ON CONFLICT (user_id, team_id) DO NOTHING
        "#,
        user_id,
        team_id,
        role,
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn insert_channel(pool: &PgPool, channel_id: Uuid) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO comms_channels (id, name, channel_type, owner_id)
        VALUES ($1, $2, 'private'::comms_channel_type, $3)
        "#,
    )
    .bind(channel_id)
    .bind("alarms")
    .bind(USER_OWNER)
    .execute(pool)
    .await?;

    Ok(())
}

async fn active_channel_participant_count(
    pool: &PgPool,
    channel_id: Uuid,
    bot_id: BotId,
) -> anyhow::Result<i64> {
    let count = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) AS "count!"
        FROM comms_channel_participants
        WHERE channel_id = $1
          AND user_id = $2
          AND left_at IS NULL
        "#,
    )
    .bind(channel_id)
    .bind(principal_id(bot_id))
    .fetch_one(pool)
    .await?;

    Ok(count)
}

async fn token_last_used_at(
    pool: &PgPool,
    token_id: Uuid,
) -> anyhow::Result<Option<chrono::DateTime<chrono::Utc>>> {
    let last_used_at = sqlx::query_scalar(
        r#"
        SELECT last_used_at
        FROM bot_tokens
        WHERE id = $1
        "#,
    )
    .bind(token_id)
    .fetch_one(pool)
    .await?;

    Ok(last_used_at)
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn bot_active_in_channel_returns_true_for_active_membership(
    pool: PgPool,
) -> anyhow::Result<()> {
    let channel_id = Uuid::new_v4();
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    insert_channel(&pool, channel_id).await?;
    let repo = PgBotsRepo::new(pool);
    repo.add_bot_to_channel(channel_id, bot_id).await?;

    assert!(repo.bot_active_in_channel(channel_id, bot_id).await?);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn bot_active_in_channel_returns_false_for_non_member(pool: PgPool) -> anyhow::Result<()> {
    let channel_id = Uuid::new_v4();
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    insert_channel(&pool, channel_id).await?;
    let repo = PgBotsRepo::new(pool);

    assert!(!repo.bot_active_in_channel(channel_id, bot_id).await?);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn bot_active_in_channel_returns_false_for_soft_deleted_membership(
    pool: PgPool,
) -> anyhow::Result<()> {
    let channel_id = Uuid::new_v4();
    let bot_id = BotId::new_from_uuid(Uuid::new_v4());
    insert_channel(&pool, channel_id).await?;
    let repo = PgBotsRepo::new(pool);
    repo.add_bot_to_channel(channel_id, bot_id).await?;
    assert!(repo.remove_bot_from_channel(channel_id, bot_id).await?);

    assert!(!repo.bot_active_in_channel(channel_id, bot_id).await?);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_user_owned_bot_records_user_owner(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);

    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("datadog"))
        .await?
        .bot;

    assert_eq!(bot.kind, BotKind::Owned);
    assert_eq!(
        bot.owner,
        Some(BotOwner::User {
            user_id: USER_OWNER.to_string(),
        })
    );
    assert_eq!(bot.created_by.as_deref(), Some(USER_OWNER));
    assert_eq!(bot.handle, "datadog");

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_team_owned_bot_requires_team_admin_or_owner(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);
    let team_id = Uuid::new_v4();
    insert_team_user(&pool, team_id, TEAM_OWNER, "owner").await?;
    insert_team_user(&pool, team_id, TEAM_ADMIN, "admin").await?;
    insert_team_user(&pool, team_id, TEAM_MEMBER, "member").await?;

    for (creator, handle) in [(TEAM_OWNER, "team-owner"), (TEAM_ADMIN, "team-admin")] {
        let mut req = create_req(handle);
        req.team_id = Some(team_id);

        let bot = service.create_bot(user_id(creator), req).await?.bot;
        assert_eq!(bot.owner, Some(BotOwner::Team { team_id }));
    }

    let mut req = create_req("team-member");
    req.team_id = Some(team_id);
    let err = service
        .create_bot(user_id(TEAM_MEMBER), req.clone())
        .await
        .expect_err("ordinary team member must not create a team-owned bot");
    assert!(matches!(err, BotError::Unauthorized));

    let err = service
        .create_bot(user_id(TEAM_OTHER), req)
        .await
        .expect_err("non-team member must not create a team-owned bot");
    assert!(matches!(err, BotError::Unauthorized));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_team_owned_channel_scoped_bot_requires_team_admin(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let team_id = Uuid::new_v4();
    let channel_id = Uuid::new_v4();
    insert_team_user(&pool, team_id, TEAM_ADMIN, "admin").await?;
    insert_team_user(&pool, team_id, TEAM_MEMBER, "member").await?;
    insert_channel(&pool, channel_id).await?;

    let mut req = create_channel_scoped_req("team-scoped-channel");
    req.team_id = Some(team_id);

    let err = service
        .create_channel_scoped_bot(user_id(TEAM_MEMBER), channel_id, req.clone())
        .await
        .expect_err("ordinary team member must not create a team-owned channel-scoped bot");
    assert!(matches!(err, BotError::Unauthorized));

    let created = service
        .create_channel_scoped_bot(user_id(TEAM_ADMIN), channel_id, req)
        .await?;
    assert_eq!(created.bot.owner, Some(BotOwner::Team { team_id }));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn add_remove_channel_bot_requires_bot_usability_and_soft_removes(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;

    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("ops-alerts"))
        .await?
        .bot;

    let err = service
        .add_bot_to_channel(user_id(USER_OTHER), channel_id, bot.id)
        .await
        .expect_err("non-owner must not add someone else's bot");
    assert!(matches!(err, BotError::Unauthorized));

    service
        .add_bot_to_channel(user_id(USER_OWNER), channel_id, bot.id)
        .await?;

    let active_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) AS "count!"
        FROM comms_channel_participants
        WHERE channel_id = $1
          AND user_id = $2
          AND left_at IS NULL
        "#,
    )
    .bind(channel_id)
    .bind(principal_id(bot.id))
    .fetch_one(&pool)
    .await?;
    assert_eq!(active_count, 1);

    let err = service
        .remove_bot_from_channel(user_id(USER_OTHER), channel_id, bot.id)
        .await
        .expect_err("non-owner must not remove someone else's bot");
    assert!(matches!(err, BotError::Unauthorized));

    service
        .remove_bot_from_channel(user_id(USER_OWNER), channel_id, bot.id)
        .await?;

    let left_at: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        r#"
        SELECT left_at
        FROM comms_channel_participants
        WHERE channel_id = $1 AND user_id = $2
        "#,
    )
    .bind(channel_id)
    .bind(principal_id(bot.id))
    .fetch_one(&pool)
    .await?;

    assert!(left_at.is_some());
    assert!(service.list_channel_bots(channel_id).await?.is_empty());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn list_bot_channels_requires_manageable_bot_and_returns_only_active_channels(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let active_channel_id = Uuid::new_v4();
    let removed_channel_id = Uuid::new_v4();
    insert_channel(&pool, active_channel_id).await?;
    insert_channel(&pool, removed_channel_id).await?;

    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("channel-list"))
        .await?
        .bot;
    let empty_bot = service
        .create_bot(user_id(USER_OWNER), create_req("empty-channel-list"))
        .await?
        .bot;

    let err = service
        .list_bot_channels(user_id(USER_OTHER), bot.id)
        .await
        .expect_err("non-owner must not list someone else's bot channels");
    assert!(matches!(err, BotError::Unauthorized));

    let empty_channels = service
        .list_bot_channels(user_id(USER_OWNER), empty_bot.id)
        .await?;
    assert!(empty_channels.is_empty());

    service
        .add_bot_to_channel(user_id(USER_OWNER), removed_channel_id, bot.id)
        .await?;
    service
        .remove_bot_from_channel(user_id(USER_OWNER), removed_channel_id, bot.id)
        .await?;
    service
        .add_bot_to_channel(user_id(USER_OWNER), active_channel_id, bot.id)
        .await?;

    let channels = service
        .list_bot_channels(user_id(USER_OWNER), bot.id)
        .await?;

    assert_eq!(channels.len(), 1);
    assert_eq!(channels[0].channel_id, active_channel_id);
    assert_eq!(channels[0].name.as_deref(), Some("alarms"));
    assert_eq!(channels[0].channel_type, BotChannelType::Private);
    assert!(channels[0].joined_at <= chrono::Utc::now());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_channel_scoped_bot_creates_bot_participant_and_token(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;

    let created = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("scoped-alerts"),
        )
        .await?;

    assert_eq!(created.bot.kind, BotKind::Owned);
    assert_eq!(created.bot.handle, "scoped-alerts");
    assert_eq!(created.bot.created_by.as_deref(), Some(USER_OWNER));
    assert_eq!(created.token.bot_id, created.bot.id);
    assert_eq!(created.token.label.as_deref(), Some("Webhook"));
    assert_eq!(created.token.token, created.bot_token);
    assert_eq!(
        active_channel_participant_count(&pool, channel_id, created.bot.id).await?,
        1
    );

    let authenticated = service
        .authenticate_channel_token(channel_id, &created.bot_token)
        .await?;
    assert_eq!(authenticated.bot_id, created.bot.id);
    assert_eq!(authenticated.kind, BotKind::Owned);
    assert!(token_last_used_at(&pool, created.token.id).await?.is_some());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authenticate_channel_token_rejects_wrong_channel_without_marking_used(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    let other_channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;
    insert_channel(&pool, other_channel_id).await?;

    let created = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("wrong-channel"),
        )
        .await?;

    let err = service
        .authenticate_channel_token(other_channel_id, &created.bot_token)
        .await
        .expect_err("channel-scoped token must not authenticate for another channel");

    assert!(matches!(err, BotError::Unauthorized));
    assert!(token_last_used_at(&pool, created.token.id).await?.is_none());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authenticate_channel_token_rejects_revoked_token(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;

    let created = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("revoked-scoped"),
        )
        .await?;

    service
        .revoke_token(user_id(USER_OWNER), created.bot.id, created.token.id)
        .await?;

    let err = service
        .authenticate_channel_token(channel_id, &created.bot_token)
        .await
        .expect_err("revoked channel-scoped token must not authenticate");

    assert!(matches!(err, BotError::Unauthorized));
    assert!(token_last_used_at(&pool, created.token.id).await?.is_none());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authenticate_channel_token_rejects_removed_channel_membership(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;

    let created = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("removed-scoped"),
        )
        .await?;

    service
        .remove_bot_from_channel(user_id(USER_OWNER), channel_id, created.bot.id)
        .await?;

    let err = service
        .authenticate_channel_token(channel_id, &created.bot_token)
        .await
        .expect_err("removed bot participant must not authenticate");

    assert!(matches!(err, BotError::Unauthorized));
    assert!(token_last_used_at(&pool, created.token.id).await?.is_none());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn revoke_token_prevents_future_authentication(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);
    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("pagerduty"))
        .await?
        .bot;

    let created = service
        .create_token(
            user_id(USER_OWNER),
            bot.id,
            CreateBotTokenRequest {
                label: Some("Datadog".to_string()),
                expires_at: None,
            },
        )
        .await?;

    assert_eq!(created.token.token, created.bearer_token);

    let authenticated = service.authenticate_token(&created.bearer_token).await?;
    assert_eq!(authenticated.bot_id, bot.id);
    assert_eq!(authenticated.kind, BotKind::Owned);

    service
        .revoke_token(user_id(USER_OWNER), bot.id, created.token.id)
        .await?;

    let err = service
        .authenticate_token(&created.bearer_token)
        .await
        .expect_err("revoked token must not authenticate");
    assert!(matches!(err, BotError::Unauthorized));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn list_tokens_returns_raw_token_for_manageable_bot(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);
    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("listed-token"))
        .await?
        .bot;

    let created = service
        .create_token(
            user_id(USER_OWNER),
            bot.id,
            CreateBotTokenRequest {
                label: Some("Listable".to_string()),
                expires_at: None,
            },
        )
        .await?;

    let tokens = service.list_tokens(user_id(USER_OWNER), bot.id).await?;

    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0].id, created.token.id);
    assert_eq!(tokens[0].bot_id, bot.id);
    assert_eq!(tokens[0].token, created.bearer_token);
    assert_eq!(tokens[0].label.as_deref(), Some("Listable"));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authenticate_channel_token_accepts_migrated_uuid_token(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = service(&pool);
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;

    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("migrated-uuid-token"))
        .await?
        .bot;
    service
        .add_bot_to_channel(user_id(USER_OWNER), channel_id, bot.id)
        .await?;

    let token_id = Uuid::new_v4();
    let raw_token = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO bot_tokens (id, bot_id, token, label)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(token_id)
    .bind(bot.id.as_uuid())
    .bind(&raw_token)
    .bind("migrated row")
    .execute(&pool)
    .await?;

    let authenticated = service
        .authenticate_channel_token(channel_id, &raw_token)
        .await?;

    assert_eq!(authenticated.bot_id, bot.id);
    assert_eq!(authenticated.kind, BotKind::Owned);
    assert!(token_last_used_at(&pool, token_id).await?.is_some());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn lifecycle_creation_publishes_exact_sanitized_events(pool: PgPool) -> anyhow::Result<()> {
    let broker = RecordingEventBroker::default();
    let service = recording_service(&pool, broker.clone());
    let user_bot = service
        .create_bot(user_id(USER_OWNER), create_req("event-user"))
        .await?
        .bot;

    let team_id = Uuid::new_v4();
    insert_team_user(&pool, team_id, TEAM_ADMIN, "admin").await?;
    let mut team_request = create_req("event-team");
    team_request.team_id = Some(team_id);
    let team_bot = service
        .create_bot(user_id(TEAM_ADMIN), team_request)
        .await?
        .bot;

    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;
    let channel_bot = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("event-channel"),
        )
        .await?;

    let events = broker.events();
    assert_eq!(events.len(), 3);
    assert_event(
        &events[0],
        user_bot.id,
        "bot.created",
        json!({
            "bot_id": user_bot.id,
            "kind": "owned",
            "owner": { "type": "user", "user_id": USER_OWNER },
            "name": user_bot.name,
            "handle": user_bot.handle,
            "description": user_bot.description,
            "avatar_url": user_bot.avatar_url,
            "created_by_user_id": USER_OWNER,
            "channel_id": null,
            "created_at": user_bot.created_at,
        }),
    );
    assert_event(
        &events[1],
        team_bot.id,
        "bot.created",
        json!({
            "bot_id": team_bot.id,
            "kind": "owned",
            "owner": { "type": "team", "team_id": team_id },
            "name": team_bot.name,
            "handle": team_bot.handle,
            "description": team_bot.description,
            "avatar_url": team_bot.avatar_url,
            "created_by_user_id": TEAM_ADMIN,
            "channel_id": null,
            "created_at": team_bot.created_at,
        }),
    );
    assert_event(
        &events[2],
        channel_bot.bot.id,
        "bot.created",
        json!({
            "bot_id": channel_bot.bot.id,
            "kind": "owned",
            "owner": { "type": "user", "user_id": USER_OWNER },
            "name": channel_bot.bot.name,
            "handle": channel_bot.bot.handle,
            "description": channel_bot.bot.description,
            "avatar_url": channel_bot.bot.avatar_url,
            "created_by_user_id": USER_OWNER,
            "channel_id": channel_id,
            "created_at": channel_bot.bot.created_at,
        }),
    );
    for event in &events {
        assert_no_token_material(&event.payload, Some(&channel_bot.bot_token));
    }

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn patch_and_delete_publish_requested_fields_and_team_owner(
    pool: PgPool,
) -> anyhow::Result<()> {
    let team_id = Uuid::new_v4();
    insert_team_user(&pool, team_id, TEAM_ADMIN, "admin").await?;
    let broker = RecordingEventBroker::default();
    let service = recording_service(&pool, broker.clone());
    let mut create_request = create_req("event-mutations");
    create_request.team_id = Some(team_id);
    let bot = service
        .create_bot(user_id(TEAM_ADMIN), create_request)
        .await?
        .bot;
    broker.clear();

    let patch_request = PatchBotRequest {
        name: Some("Renamed alerts".to_string()),
        handle: None,
        description: Some("Replacement description".to_string()),
        avatar_url: None,
    };
    let patched = service
        .patch_bot(user_id(TEAM_ADMIN), bot.id, patch_request)
        .await?;

    let events = broker.events();
    assert_eq!(events.len(), 1);
    assert_event(
        &events[0],
        bot.id,
        "bot.updated",
        json!({
            "bot_id": bot.id,
            "owner": { "type": "team", "team_id": team_id },
            "actor_user_id": TEAM_ADMIN,
            "name": "Renamed alerts",
            "handle": null,
            "description": "Replacement description",
            "avatar_url": null,
            "updated_at": patched.updated_at,
        }),
    );
    assert_no_token_material(&events[0].payload, None);

    broker.clear();
    service.delete_bot(user_id(TEAM_ADMIN), bot.id).await?;
    let events = broker.events();
    assert_eq!(events.len(), 1);
    assert_event(
        &events[0],
        bot.id,
        "bot.deleted",
        json!({
            "bot_id": bot.id,
            "owner": { "type": "team", "team_id": team_id },
            "actor_user_id": TEAM_ADMIN,
        }),
    );
    assert_no_token_material(&events[0].payload, None);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn non_lifecycle_and_failed_operations_do_not_publish(pool: PgPool) -> anyhow::Result<()> {
    let broker = RecordingEventBroker::default();
    let service = recording_service(&pool, broker.clone());
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;
    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("event-exclusions"))
        .await?
        .bot;
    broker.clear();

    service.list_bots(user_id(USER_OWNER)).await?;
    service.get_bot(user_id(USER_OWNER), bot.id).await?;
    service.list_channel_bots(channel_id).await?;
    service
        .add_bot_to_channel(user_id(USER_OWNER), channel_id, bot.id)
        .await?;
    service
        .list_bot_channels(user_id(USER_OWNER), bot.id)
        .await?;
    service
        .remove_bot_from_channel(user_id(USER_OWNER), channel_id, bot.id)
        .await?;

    let token = service
        .create_token(
            user_id(USER_OWNER),
            bot.id,
            CreateBotTokenRequest {
                label: Some("No event".to_string()),
                expires_at: None,
            },
        )
        .await?;
    service.list_tokens(user_id(USER_OWNER), bot.id).await?;
    service.authenticate_token(&token.bearer_token).await?;
    service
        .revoke_token(user_id(USER_OWNER), bot.id, token.token.id)
        .await?;

    let unauthorized = service
        .patch_bot(
            user_id(USER_OTHER),
            bot.id,
            PatchBotRequest {
                name: Some("Forbidden".to_string()),
                handle: None,
                description: None,
                avatar_url: None,
            },
        )
        .await;
    assert!(matches!(unauthorized, Err(BotError::Unauthorized)));

    let missing = service
        .delete_bot(user_id(USER_OWNER), BotId::new_from_uuid(Uuid::new_v4()))
        .await;
    assert!(matches!(missing, Err(BotError::NotFound(_))));

    let repository_failure = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            Uuid::new_v4(),
            create_channel_scoped_req("missing-channel"),
        )
        .await;
    assert!(matches!(repository_failure, Err(BotError::Repo(_))));
    assert!(broker.events().is_empty());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn scheduling_failures_do_not_change_successful_mutations(
    pool: PgPool,
) -> anyhow::Result<()> {
    let service = recording_service(&pool, RecordingEventBroker::failing());
    let channel_id = Uuid::new_v4();
    insert_channel(&pool, channel_id).await?;
    let channel_bot = service
        .create_channel_scoped_bot(
            user_id(USER_OWNER),
            channel_id,
            create_channel_scoped_req("scoped-schedule-failure"),
        )
        .await?;
    assert_eq!(channel_bot.bot.handle, "scoped-schedule-failure");

    let bot = service
        .create_bot(user_id(USER_OWNER), create_req("event-schedule-failure"))
        .await?
        .bot;
    let patched = service
        .patch_bot(
            user_id(USER_OWNER),
            bot.id,
            PatchBotRequest {
                name: Some("Still succeeds".to_string()),
                handle: None,
                description: None,
                avatar_url: None,
            },
        )
        .await?;
    assert_eq!(patched.name, "Still succeeds");
    service.delete_bot(user_id(USER_OWNER), bot.id).await?;

    Ok(())
}

fn agent_req(handle: &str, mode: AgentMode, webhook_url: Option<&str>) -> CreateBotRequest {
    CreateBotRequest {
        team_id: None,
        name: "Helper".to_string(),
        handle: handle.to_string(),
        description: None,
        avatar_url: None,
        agent: Some(CreateAgentConfigRequest {
            mode,
            events: vec![BotEventKind::ChannelBotMentioned],
            webhook_url: webhook_url.map(str::to_string),
        }),
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_macro_agent_bot_persists_agent_config(pool: PgPool) -> anyhow::Result<()> {
    let provisioner = FakeAgentWebhookProvisioner::default();
    let service = BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        NoopMacroEventBroker,
        provisioner.clone(),
    );

    let response = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req("macro-agent", AgentMode::Macro, None),
        )
        .await?;

    assert!(response.agent_webhook.is_none());
    assert!(provisioner.provisioned.lock().unwrap().is_empty());
    let agent = response.bot.agent.clone().expect("agent config");
    assert_eq!(response.bot.bot_type, BotType::Agent);
    assert_eq!(agent.mode, AgentMode::Macro);
    assert_eq!(agent.events, vec![BotEventKind::ChannelBotMentioned]);
    assert_eq!(agent.webhook_id, None);

    // The persisted row round-trips the config.
    let fetched = service
        .get_bot(user_id(USER_OWNER), response.bot.id)
        .await?;
    assert_eq!(fetched.agent, Some(agent));
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_external_agent_bot_provisions_webhook(pool: PgPool) -> anyhow::Result<()> {
    let provisioner = FakeAgentWebhookProvisioner::default();
    let service = BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        NoopMacroEventBroker,
        provisioner.clone(),
    );

    // The provisioned webhook row must exist before the bot row references it.
    insert_webhook_stub(&pool).await?;

    let response = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req(
                "external-agent",
                AgentMode::External,
                Some("https://example.com/hooks/agent"),
            ),
        )
        .await?;

    let agent_webhook = response.agent_webhook.expect("provisioned webhook");
    assert_eq!(agent_webhook.signing_secret, "whsec_test");
    assert_eq!(
        agent_webhook.endpoint_url,
        "https://example.com/hooks/agent"
    );

    let agent = response.bot.agent.clone().expect("agent config");
    assert_eq!(agent.mode, AgentMode::External);
    assert_eq!(
        agent.webhook_id.as_deref(),
        Some(agent_webhook.webhook_id.as_str())
    );

    let provisioned = provisioner.provisioned.lock().unwrap().clone();
    assert_eq!(provisioned.len(), 1);
    assert_eq!(provisioned[0].bot_id, response.bot.id);
    assert_eq!(
        provisioned[0].endpoint_url,
        "https://example.com/hooks/agent"
    );
    Ok(())
}

/// Insert the webhook row the fake provisioner reports, satisfying the
/// `bots.agent_webhook_id` foreign key.
async fn insert_webhook_stub(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO webhook (
            id, workspace_id, name, endpoint_url, signing_secret, filters, created_by_user_id
        )
        VALUES ($1, $2, 'Helper', 'https://example.com/hooks/agent', 'whsec_test', '[]'::jsonb, $2)
        "#,
    )
    .bind(FAKE_AGENT_WEBHOOK_ID)
    .bind(USER_OWNER)
    .execute(pool)
    .await?;
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn create_agent_bot_validates_configuration(pool: PgPool) -> anyhow::Result<()> {
    let service = service(&pool);

    // External agents require a webhook URL.
    let err = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req("external-missing-url", AgentMode::External, None),
        )
        .await
        .expect_err("external agent without webhook_url must fail");
    assert!(matches!(err, BotError::BadRequest(_)));

    // Macro agents must not carry a webhook URL.
    let err = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req(
                "macro-with-url",
                AgentMode::Macro,
                Some("https://example.com/hooks/agent"),
            ),
        )
        .await
        .expect_err("macro agent with webhook_url must fail");
    assert!(matches!(err, BotError::BadRequest(_)));

    // Agents must subscribe to at least one event.
    let mut request = agent_req("no-events", AgentMode::Macro, None);
    request.agent.as_mut().expect("agent config").events = Vec::new();
    let err = service
        .create_bot(user_id(USER_OWNER), request)
        .await
        .expect_err("agent without events must fail");
    assert!(matches!(err, BotError::BadRequest(_)));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn external_agent_provisioning_failure_creates_no_bot(pool: PgPool) -> anyhow::Result<()> {
    let service = BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        NoopMacroEventBroker,
        FakeAgentWebhookProvisioner::failing(),
    );

    let err = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req(
                "rejected-endpoint",
                AgentMode::External,
                Some("https://rejected.example.com"),
            ),
        )
        .await
        .expect_err("rejected endpoint must fail creation");
    assert!(matches!(err, BotError::BadRequest(_)));

    assert!(service.list_bots(user_id(USER_OWNER)).await?.is_empty());
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn delete_external_agent_removes_provisioned_webhook(pool: PgPool) -> anyhow::Result<()> {
    let provisioner = FakeAgentWebhookProvisioner::default();
    let service = BotServiceImpl::new(
        PgBotsRepo::new(pool.clone()),
        NoopMacroEventBroker,
        provisioner.clone(),
    );
    insert_webhook_stub(&pool).await?;

    let response = service
        .create_bot(
            user_id(USER_OWNER),
            agent_req(
                "deleted-agent",
                AgentMode::External,
                Some("https://example.com/hooks/agent"),
            ),
        )
        .await?;
    let webhook_id = response
        .bot
        .agent
        .as_ref()
        .and_then(|agent| agent.webhook_id.clone())
        .expect("webhook id");

    service
        .delete_bot(user_id(USER_OWNER), response.bot.id)
        .await?;

    assert_eq!(
        provisioner.removed.lock().unwrap().clone(),
        vec![webhook_id]
    );
    Ok(())
}
