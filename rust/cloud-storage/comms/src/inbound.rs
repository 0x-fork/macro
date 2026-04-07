use axum::{
    Json, Router,
    extract::{FromRef, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use doppleganger::{Doppleganger, Mirror};
use entity_access::domain::models::OwnerParticipantRole;
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::ChannelAccessLevelExtractor;
use frecency::domain::models::AggregateFrecency;
use macro_user_id::user_id::MacroUserIdStr;
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use models_comms::channel::{ChannelId, OrganizationId};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domain::{
    models::{BotError, CreateBotRequest, GetChannelsRequest},
    ports::ChannelsService,
};

pub struct CommsRouterState<S, Svc> {
    pub inner: Arc<S>,
    pub access_service: Arc<Svc>,
}

impl<S, Svc> Clone for CommsRouterState<S, Svc> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
            access_service: Arc::clone(&self.access_service),
        }
    }
}

impl<S: ChannelsService, Svc: EntityAccessService> CommsRouterState<S, Svc> {
    pub fn new(s: S, access_service: Arc<Svc>) -> Self {
        CommsRouterState {
            inner: Arc::new(s),
            access_service,
        }
    }
}

impl<S, Svc> FromRef<CommsRouterState<S, Svc>> for Arc<Svc> {
    fn from_ref(state: &CommsRouterState<S, Svc>) -> Self {
        state.access_service.clone()
    }
}

pub fn comms_router<S: ChannelsService, Svc: EntityAccessService, T: Send + Sync + 'static>(
    s: CommsRouterState<S, Svc>,
) -> Router<T> {
    Router::new()
        .route("/channels", get(get_channels_handler))
        .route("/activity", get(get_activity_handler))
        .route("/webhooks/integrations", get(get_integrations_handler))
        .route(
            "/channels/{channel_id}/webhooks",
            post(create_bot_handler::<S, Svc>),
        )
        .with_state(s)
}

#[derive(Debug, Error)]
pub enum CommsErr {
    #[error("Internal server error")]
    Internal,
}

impl IntoResponse for CommsErr {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            CommsErr::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status, self.to_string()).into_response()
    }
}

#[utoipa::path(
    get,
    path = "/channels",
    tag = "channels",
    operation_id = "get_channels",
    responses(
        (status = 200, body=Vec<ApiChannelWithLatest>),
        (status = 401, body=String),
        (status = 404, body=String),
        (status = 500, body=String),
    )
)]
async fn get_channels_handler<S: ChannelsService, Svc: EntityAccessService>(
    State(service): State<CommsRouterState<S, Svc>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
) -> Result<Json<Vec<ApiChannelWithLatest>>, CommsErr> {
    let res = service
        .inner
        .get_channels(GetChannelsRequest {
            macro_id: macro_user_id,
            limit: None,
            query: models_pagination::Query::Sort(
                models_pagination::SimpleSortMethod::UpdatedAt,
                None,
            ),
        })
        .await
        .map_err(|_| CommsErr::Internal)?;

    Ok(Json(<Vec<ApiChannelWithLatest>>::mirror(res)))
}

#[tracing::instrument(skip(service))]
#[utoipa::path(get,
    tag = "activity",
    operation_id = "get_activity",
    path = "/activity", responses(
    (status = 200, body=Vec<ApiActivity>),
    (status = 401, body=String),
    (status = 404, body=String),
    (status = 500, body=String),
))]
pub async fn get_activity_handler<S: ChannelsService, Svc: EntityAccessService>(
    State(service): State<CommsRouterState<S, Svc>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
) -> Result<Json<Vec<ApiActivity>>, CommsErr> {
    let res = service
        .inner
        .get_activities(macro_user_id)
        .await
        .map_err(|_| CommsErr::Internal)?;

    Ok(Json(<Vec<ApiActivity>>::mirror(res)))
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Doppleganger)]
#[serde(rename_all = "snake_case")]
#[dg(backward = models_comms::channel::ParticipantRole)]
pub enum ParticipantRole {
    Owner,
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = models_comms::channel::ChannelParticipant)]
pub struct ChannelParticipant {
    /// id of the channel
    #[schema(value_type = Uuid)]
    pub channel_id: ChannelId,
    /// id of the user
    #[schema(value_type = String)]
    pub user_id: MacroUserIdStr<'static>,
    /// type of the participant
    pub role: ParticipantRole,
    /// timestamp of when the user joined the channel
    pub joined_at: chrono::DateTime<chrono::Utc>,
    /// timestamp of when the user left the channel
    pub left_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = models_comms::channel::ChannelWithParticipants)]
pub struct ChannelWithParticipants {
    #[serde(flatten)]
    pub channel: Channel,
    pub participants: Vec<ChannelParticipant>,
}

#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = models_comms::channel::ChannelWithLatest)]
pub struct ApiChannelWithLatest {
    #[serde(flatten)]
    pub channel: ChannelWithParticipants,
    #[serde(flatten)]
    pub latest_message: LatestMessage,
    pub viewed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub interacted_at: Option<chrono::DateTime<chrono::Utc>>,
    #[dg(map = map_frecency)]
    pub frecency_score: Option<f64>,
}

fn map_frecency(f: Option<AggregateFrecency>) -> Option<f64> {
    f.map(|f| f.data.frecency_score)
}

#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = models_comms::channel::Channel)]
pub struct Channel {
    /// uuid of the channel
    #[schema(value_type = Uuid)]
    pub id: ChannelId,
    /// string name of the channel
    pub name: Option<String>,
    /// type of the channel
    pub channel_type: ChannelType,
    /// id of the organization this channel belongs too
    #[schema(value_type = Option<u32>)]
    pub org_id: Option<OrganizationId>,
    /// timestamp of when the channel was created
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// timestamp of when the channel was last updated
    pub updated_at: chrono::DateTime<chrono::Utc>,
    /// id of the user who created the channel
    #[schema(value_type = String)]
    pub owner_id: MacroUserIdStr<'static>,
}

#[derive(Debug, Clone, ToSchema, Serialize, Doppleganger)]
#[dg(backward = models_comms::channel::LatestMessage)]
pub struct LatestMessage {
    pub latest_message: Option<ChannelMessage>,
    pub latest_non_thread_message: Option<ChannelMessage>,
}

#[derive(Debug, Clone, Copy, Serialize, Doppleganger, ToSchema)]
#[dg(backward = models_comms::channel::ChannelType)]
#[serde(rename_all = "snake_case")]
pub enum ChannelType {
    Public,
    Organization,
    Private,
    DirectMessage,
    Team,
}

#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = models_comms::channel::ChannelMessage)]
pub struct ChannelMessage {
    pub message_id: Uuid,
    pub thread_id: Option<Uuid>,
    pub sender_id: String,
    pub content: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    /// message mentions formatted as `{ENTITY_TYPE}:{ENTITY_ID}`
    pub mentions: Vec<String>,
}

#[derive(Debug, ToSchema, Doppleganger, Serialize)]
#[dg(backward = models_comms::channel::Activity)]
pub struct ApiActivity {
    pub id: Uuid,
    pub user_id: String,
    #[schema(value_type = Uuid)]
    pub channel_id: ChannelId,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    /// the last time the user viewed the channel
    pub viewed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// the last time the user intereacted with the channel
    /// eg. reacting, replying, sending a message
    pub interacted_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[utoipa::path(
    get,
    path = "/webhooks/integrations",
    tag = "bots",
    operation_id = "get_bot_integrations",
    responses(
        (status = 200, body = Vec<ApiBotIntegration>),
        (status = 500, body = String),
    )
)]
async fn get_integrations_handler<S: ChannelsService, Svc: EntityAccessService>(
    State(service): State<CommsRouterState<S, Svc>>,
) -> Result<Json<Vec<ApiBotIntegration>>, CommsErr> {
    let integrations = service
        .inner
        .get_integrations()
        .await
        .map_err(|_| CommsErr::Internal)?;

    Ok(Json(<Vec<ApiBotIntegration>>::mirror(integrations)))
}

/// API response type for a bot integration.
#[derive(Debug, Clone, Serialize, ToSchema, Doppleganger)]
#[dg(backward = crate::domain::models::BotIntegration)]
pub struct ApiBotIntegration {
    /// Unique identifier.
    pub id: Uuid,
    /// Short key (e.g. "github", "datadog", "generic").
    pub key: String,
    /// Human-readable display name.
    pub name: String,
    /// URL or path to the integration's icon.
    pub icon_url: Option<String>,
    /// Integration tier.
    pub tier: ApiIntegrationTier,
    /// Suggested payload template for template-guided integrations.
    pub payload_template: Option<String>,
    /// Markdown setup instructions shown during bot creation.
    pub setup_instructions: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema, Doppleganger)]
#[dg(backward = crate::domain::models::IntegrationTier)]
#[serde(rename_all = "snake_case")]
pub enum ApiIntegrationTier {
    /// Dedicated endpoint that parses the service's native payload format.
    Native,
    /// Uses the generic endpoint, but with suggested payload templates.
    TemplateGuided,
    /// Uses the generic endpoint with a simple `{ "text": "..." }` contract.
    Generic,
}

// ── Create Bot ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateBotApiRequest {
    /// Display name for the bot in messages.
    pub name: String,
    /// The integration type ID (from GET /webhooks/integrations).
    pub integration_id: Uuid,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreateBotResponse {
    /// The created bot's ID.
    pub id: Uuid,
    /// The webhook authentication token (only shown once).
    pub token: String,
    /// The integration key (e.g. "github", "generic") for building the webhook URL.
    pub integration_key: String,
}

#[derive(Debug, Error)]
pub enum CreateBotError {
    #[error("{0}")]
    Validation(String),
    #[error("Internal error")]
    Internal,
}

impl IntoResponse for CreateBotError {
    fn into_response(self) -> axum::response::Response {
        if matches!(self, CreateBotError::Internal) {
            tracing::error!(error=?self, "create bot error");
        }

        let status = match &self {
            CreateBotError::Validation(_) => StatusCode::BAD_REQUEST,
            CreateBotError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let message = self.to_string();
        (
            status,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}

impl From<BotError> for CreateBotError {
    fn from(err: BotError) -> Self {
        match err {
            BotError::Validation(msg) => CreateBotError::Validation(msg),
            BotError::Internal(_) => CreateBotError::Internal,
        }
    }
}

#[utoipa::path(
    post,
    tag = "bots",
    operation_id = "create_channel_bot",
    path = "/channels/{channel_id}/webhooks",
    params(
        ("channel_id" = String, Path, description = "id of the channel")
    ),
    responses(
        (status = 201, body = CreateBotResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip(service, access))]
async fn create_bot_handler<S: ChannelsService, Svc: EntityAccessService>(
    State(service): State<CommsRouterState<S, Svc>>,
    access: ChannelAccessLevelExtractor<OwnerParticipantRole, Svc>,
    Json(req): Json<CreateBotApiRequest>,
) -> Result<(StatusCode, Json<CreateBotResponse>), CreateBotError> {
    let created = service
        .inner
        .create_bot(
            &access.entity_access_receipt,
            CreateBotRequest {
                integration_id: req.integration_id,
                name: req.name,
            },
        )
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateBotResponse {
            id: created.id,
            token: created.token,
            integration_key: created.integration_key,
        }),
    ))
}
