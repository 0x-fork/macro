use doppleganger::{Doppleganger, Mirror};
use rootcause::Report;
use sqlx::PgPool;

use crate::domain::models::{BotIntegration, CreateBotRequest, CreatedBot, IntegrationTier};
use crate::domain::ports::BotIntegrationRepo;

#[derive(Debug, Clone, Copy, Doppleganger, sqlx::Type)]
#[sqlx(type_name = "comms_integration_tier", rename_all = "snake_case")]
#[dg(forward = IntegrationTier)]
pub enum DbIntegrationTier {
    Native,
    TemplateGuided,
    Generic,
}

/// Fetches all bot integrations from the database.
#[tracing::instrument(skip(db), err)]
async fn get_all_integrations(db: &PgPool) -> Result<Vec<BotIntegration>, Report> {
    let rows = sqlx::query!(
        r#"
        SELECT
            id,
            key,
            name,
            icon_url,
            tier as "tier: DbIntegrationTier",
            payload_template,
            setup_instructions
        FROM comms_webhook_integrations
        ORDER BY name ASC
        "#
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| BotIntegration {
            id: row.id,
            key: row.key,
            name: row.name,
            icon_url: row.icon_url,
            tier: DbIntegrationTier::mirror(row.tier),
            payload_template: row.payload_template,
            setup_instructions: row.setup_instructions,
        })
        .collect())
}

/// Creates a new channel bot and returns its ID and integration key.
#[tracing::instrument(skip(db, token_hash, req), fields(channel_id = %channel_id), err)]
async fn create_bot(
    db: &PgPool,
    channel_id: uuid::Uuid,
    created_by: String,
    token_hash: &str,
    req: CreateBotRequest,
) -> Result<CreatedBot, Report> {
    let bot_id = macro_uuid::generate_uuid_v7();

    // Validate integration exists and get its key for the response
    let integration = sqlx::query!(
        r#"SELECT key FROM comms_webhook_integrations WHERE id = $1"#,
        req.integration_id,
    )
    .fetch_one(db)
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO comms_channel_webhooks (id, channel_id, integration_id, name, token_hash, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        bot_id,
        channel_id,
        req.integration_id,
        req.name,
        token_hash,
        created_by,
    )
    .execute(db)
    .await?;

    Ok(CreatedBot {
        id: bot_id,
        token: String::new(), // filled by service layer
        integration_key: integration.key,
    })
}

/// Database-backed implementation of [`BotIntegrationRepo`].
pub struct PgBotIntegrationRepo {
    pool: PgPool,
}

impl PgBotIntegrationRepo {
    /// Creates a new repo with the given database connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl BotIntegrationRepo for PgBotIntegrationRepo {
    async fn get_all_integrations(&self) -> Result<Vec<BotIntegration>, Report> {
        get_all_integrations(&self.pool).await
    }

    async fn create_bot(
        &self,
        channel_id: uuid::Uuid,
        created_by: String,
        token_hash: &str,
        req: CreateBotRequest,
    ) -> Result<CreatedBot, Report> {
        create_bot(&self.pool, channel_id, created_by, token_hash, req).await
    }
}
