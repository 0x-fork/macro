//! Thin HTTP adapter: authenticated owners and external chat receipts flow to
//! [`LinkedService`]. DSS mounts [`external_chats_router`] at `/external-chats`
//! (any provider's added chats) and [`whatsapp_router`] at `/whatsapp` (the
//! WhatsApp account, pairing and chat list).

use crate::domain::{models::*, service::LinkedService, timeline::*};
use axum::extract::Query;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, FromRef, Multipart, Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use entity_access::domain::models::{OwnerAccessLevel, ViewAccessLevel};
use entity_access::{
    domain::ports::EntityAccessService, inbound::axum_extractors::ExternalChatAccessLevelExtractor,
};
use macro_authorization::{
    CredentialOrigin, MacroAuthorizationExtractor, MacroAuthorizationService,
    MacroAuthorizationState, MacroUserAuthentication, UserOnly,
};
use models_permissions::share_permission::{SharePermissionV2, UpdateSharePermissionRequestV2};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

/// Capabilities supplied by DSS.
pub struct LinkedRouterState<Eas, Auth> {
    /// Use cases.
    pub service: Arc<LinkedService>,
    /// Standard group receipt provider.
    pub entity_access_service: Arc<Eas>,
    /// Standard authentication provider.
    pub authorization_state: MacroAuthorizationState<Auth>,
}

impl<Eas, Auth> Clone for LinkedRouterState<Eas, Auth> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            entity_access_service: self.entity_access_service.clone(),
            authorization_state: self.authorization_state.clone(),
        }
    }
}

impl<Eas, Auth> FromRef<LinkedRouterState<Eas, Auth>> for Arc<Eas> {
    fn from_ref(state: &LinkedRouterState<Eas, Auth>) -> Self {
        state.entity_access_service.clone()
    }
}

impl<Eas, Auth> FromRef<LinkedRouterState<Eas, Auth>> for MacroAuthorizationState<Auth> {
    fn from_ref(state: &LinkedRouterState<Eas, Auth>) -> Self {
        state.authorization_state.clone()
    }
}

/// Domain errors as `{code, message}` JSON.
pub struct ApiError(LinkedError);

impl From<rootcause::Report<LinkedError>> for ApiError {
    fn from(error: rootcause::Report<LinkedError>) -> Self {
        if matches!(
            error.current_context(),
            LinkedError::Unavailable | LinkedError::Fenced | LinkedError::Internal
        ) {
            tracing::error!(error = ?error, "WhatsApp linked request failed");
        }
        Self(error.current_context().clone())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0 {
            LinkedError::Invalid(_) | LinkedError::CannotAdd(_) => StatusCode::BAD_REQUEST,
            LinkedError::Forbidden => StatusCode::FORBIDDEN,
            LinkedError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            LinkedError::NotFound => StatusCode::NOT_FOUND,
            LinkedError::Conflict | LinkedError::Disconnected | LinkedError::SendExpired => {
                StatusCode::CONFLICT
            }
            LinkedError::Unavailable | LinkedError::Backlogged => StatusCode::SERVICE_UNAVAILABLE,
            LinkedError::Fenced | LinkedError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let mut response = (
            status,
            Json(serde_json::json!({ "code": self.0.code(), "message": self.0.to_string() })),
        )
            .into_response();
        if matches!(self.0, LinkedError::RateLimited) {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static("1"));
        }
        response
    }
}

/// Explicit pairing intent; replacement is a separate deliberate action.
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
#[schema(as = WhatsAppConnect)]
pub struct Connect {
    /// Replace the retained identity with a different WhatsApp account.
    #[serde(default)]
    pub replace: bool,
}

/// The consent generation the owner deliberately disconnects.
#[derive(Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
#[schema(as = WhatsAppDisconnectRequest)]
pub struct DisconnectRequest {
    /// Fences retries against a later reconnect or replacement.
    pub authorization_generation: i64,
}

fn authority(user: &MacroUserAuthentication) -> SendAuthority {
    match user.origin {
        CredentialOrigin::MacroApiJwt | CredentialOrigin::UserApiKey => SendAuthority::UserApiToken,
        CredentialOrigin::Session if user.agent_id.is_none() => SendAuthority::Human,
        CredentialOrigin::Session
        | CredentialOrigin::Bot
        | CredentialOrigin::Harness
        | CredentialOrigin::Internal => SendAuthority::Automation,
    }
}

/// Pairing codes and send drafts are never cached.
fn no_store<S: Clone + Send + Sync + 'static>(router: Router<S>) -> Router<S> {
    router.layer(axum::middleware::map_response(
        |mut response: Response| async move {
            let headers = response.headers_mut();
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            headers.insert(
                header::REFERRER_POLICY,
                HeaderValue::from_static("no-referrer"),
            );
            response
        },
    ))
}

/// Added chats of any provider, under `/external-chats`.
pub fn external_chats_router<Eas, Auth, S>(state: LinkedRouterState<Eas, Auth>) -> Router<S>
where
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
    S: Send + Sync + 'static,
{
    no_store(
        Router::new()
            .route("/", get(list::<Eas, Auth>).post(add::<Eas, Auth>))
            .route(
                "/{chat_id}",
                get(chat::<Eas, Auth>).delete(remove::<Eas, Auth>),
            )
            .route("/{chat_id}/messages", get(messages::<Eas, Auth>))
            .route(
                "/{chat_id}/messages/{message_id}",
                get(message::<Eas, Auth>),
            )
            .route(
                "/{chat_id}/messages/attachments",
                post(message_attachments::<Eas, Auth>),
            )
            .route("/{chat_id}/read", post(mark_read::<Eas, Auth>))
            .route(
                "/{chat_id}/permissions",
                get(permissions::<Eas, Auth>).patch(update_permissions::<Eas, Auth>),
            )
            .route(
                "/{chat_id}/sends",
                get(open_sends::<Eas, Auth>).post(send::<Eas, Auth>),
            )
            .route(
                "/{chat_id}/attachments",
                post(upload::<Eas, Auth>)
                    .layer(DefaultBodyLimit::max(MEDIA_LIMIT_BYTES + 64 * 1024)),
            )
            .route("/{chat_id}/delivery", post(delivery::<Eas, Auth>)),
    )
    .with_state(state)
}

/// The caller's WhatsApp account, pairing and chat list, under `/whatsapp`.
pub fn whatsapp_router<Eas, Auth, S>(state: LinkedRouterState<Eas, Auth>) -> Router<S>
where
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
    S: Send + Sync + 'static,
{
    no_store(
        Router::new()
            .route("/account", get(account::<Eas, Auth>))
            .route("/connect", post(connect::<Eas, Auth>))
            .route("/disconnect", post(disconnect::<Eas, Auth>))
            .route(
                "/pairing/{id}",
                get(pairing::<Eas, Auth>).delete(cancel::<Eas, Auth>),
            )
            .route("/pairing/{id}/passkey", post(passkey::<Eas, Auth>))
            .route("/chats", get(chats::<Eas, Auth>)),
    )
    .with_state(state)
}

/// The caller's own account.
#[utoipa::path(get, path = "/whatsapp/account", operation_id = "whatsapp_account", responses((status = 200, body = AccountView)))]
pub async fn account<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
) -> Result<Json<AccountView>, ApiError> {
    Ok(Json(AccountView {
        account: state
            .service
            .account(&auth.authorization.macro_user_id)
            .await?,
    }))
}

/// Start or resume the caller's pairing transaction.
#[utoipa::path(post, path = "/whatsapp/connect", operation_id = "whatsapp_connect", request_body = Connect, responses((status = 200, body = Pairing)))]
pub async fn connect<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Json(body): Json<Connect>,
) -> Result<Json<Pairing>, ApiError> {
    Ok(Json(
        state
            .service
            .connect(
                &auth.authorization.macro_user_id,
                body.replace,
                authority(&auth.authorization),
            )
            .await?,
    ))
}

/// Poll the caller's pairing transaction, including its current QR code.
#[utoipa::path(get, path = "/whatsapp/pairing/{id}", operation_id = "whatsapp_pairing", params(("id" = Uuid, Path)), responses((status = 200, body = PairState)))]
pub async fn pairing<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Path(id): Path<Uuid>,
) -> Result<Json<PairState>, ApiError> {
    Ok(Json(
        state
            .service
            .pair_state(
                &auth.authorization.macro_user_id,
                id,
                authority(&auth.authorization),
            )
            .await?,
    ))
}

/// Cancel the caller's pairing transaction.
#[utoipa::path(delete, path = "/whatsapp/pairing/{id}", operation_id = "whatsapp_cancel_pairing", params(("id" = Uuid, Path)), responses((status = 204)))]
pub async fn cancel<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state
        .service
        .cancel(
            &auth.authorization.macro_user_id,
            id,
            authority(&auth.authorization),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Forward the owner's WebAuthn assertion to the pairing replica.
#[utoipa::path(post, path = "/whatsapp/pairing/{id}/passkey", operation_id = "whatsapp_passkey", params(("id" = Uuid, Path)), request_body = Object, responses((status = 204)))]
pub async fn passkey<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Path(id): Path<Uuid>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, ApiError> {
    state
        .service
        .passkey(
            &auth.authorization.macro_user_id,
            id,
            &body,
            authority(&auth.authorization),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Multipart body of the attachments route.
#[derive(utoipa::ToSchema)]
#[schema(as = ExternalChatUploadRequest)]
pub struct UploadRequest {
    /// One supported image, audio, video, PDF or text file.
    #[schema(value_type = String, format = Binary)]
    pub file: Vec<u8>,
}

/// Stage one attachment for a later media send in this chat.
#[utoipa::path(post, path = "/external-chats/{chat_id}/attachments", operation_id = "external_chat_upload", params(("chat_id" = Uuid, Path)), request_body(content = UploadRequest, content_type = "multipart/form-data"), responses((status = 200, body = UploadedAttachment)))]
pub async fn upload<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    mut input: Multipart,
) -> Result<Json<UploadedAttachment>, ApiError> {
    let invalid = |message| ApiError(LinkedError::Invalid(message));
    let field = input
        .next_field()
        .await
        .map_err(|_| invalid("invalid attachment"))?
        .ok_or_else(|| invalid("choose a file"))?;
    if field.name() != Some("file") {
        return Err(invalid("one file field is required"));
    }
    let filename = field
        .file_name()
        .ok_or_else(|| invalid("a filename is required"))?
        .to_owned();
    let mime = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_owned();
    let bytes = field
        .bytes()
        .await
        .map_err(|_| invalid("attachment exceeds the size limit"))?;
    Ok(Json(
        state
            .service
            .upload_attachment(
                &access.entity_access_receipt,
                &filename,
                &mime,
                &bytes,
                authority(&auth.authorization),
            )
            .await?,
    ))
}

/// End the caller's observation consent.
#[utoipa::path(post, path = "/whatsapp/disconnect", operation_id = "whatsapp_disconnect", request_body = DisconnectRequest, responses((status = 200, body = Disconnect)))]
pub async fn disconnect<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Json(body): Json<DisconnectRequest>,
) -> Result<Json<Disconnect>, ApiError> {
    Ok(Json(
        state
            .service
            .disconnect(
                &auth.authorization.macro_user_id,
                body.authorization_generation,
                authority(&auth.authorization),
            )
            .await?,
    ))
}

/// The caller's WhatsApp chat list (groups and direct chats), newest
/// activity first, with what can be added to Macro.
#[utoipa::path(get, path = "/whatsapp/chats", operation_id = "whatsapp_chats", responses((status = 200, body = ChatList)))]
pub async fn chats<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
) -> Result<Json<ChatList>, ApiError> {
    Ok(Json(
        state
            .service
            .chats(&auth.authorization.macro_user_id)
            .await?,
    ))
}

/// Add one of the caller's provider chats as their own external chat.
#[utoipa::path(post, path = "/external-chats", operation_id = "external_chat_add", request_body = AddChat, responses((status = 200, body = AddedChat)))]
pub async fn add<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    Json(body): Json<AddChat>,
) -> Result<Json<AddedChat>, ApiError> {
    let binding = state
        .service
        .adopt(
            &auth.authorization.macro_user_id,
            &body,
            authority(&auth.authorization),
        )
        .await?;
    Ok(Json(AddedChat {
        chat_id: binding.id,
    }))
}

/// An external chat the caller can read.
#[utoipa::path(get, path = "/external-chats/{chat_id}", operation_id = "external_chat", params(("chat_id" = Uuid, Path)), responses((status = 200, body = ExternalChatDetail)))]
pub async fn chat<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
) -> Result<Json<ExternalChatDetail>, ApiError> {
    Ok(Json(
        state
            .service
            .group_detail(&access.entity_access_receipt)
            .await?,
    ))
}

/// Send to the chat from the caller's own provider account (one request per second per user).
#[utoipa::path(post, path = "/external-chats/{chat_id}/sends", operation_id = "external_chat_send", params(("chat_id" = Uuid, Path)), request_body = SendReply, responses((status = 200, body = SendProgress), (status = 429, description = "One send request per second per user; Retry-After: 1")))]
pub async fn send<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Json(body): Json<SendReply>,
) -> Result<Json<SendProgress>, ApiError> {
    Ok(Json(
        state
            .service
            .send_reply(
                &access.entity_access_receipt,
                &body,
                authority(&auth.authorization),
            )
            .await?,
    ))
}

/// The caller's send progress for intents or messages.
#[utoipa::path(post, path = "/external-chats/{chat_id}/delivery", operation_id = "external_chat_delivery", params(("chat_id" = Uuid, Path)), request_body = Vec<Uuid>, responses((status = 200, body = Vec<SendProgress>)))]
pub async fn delivery<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Json(ids): Json<Vec<Uuid>>,
) -> Result<Json<Vec<SendProgress>>, ApiError> {
    Ok(Json(
        state
            .service
            .delivery(&access.entity_access_receipt, &ids)
            .await?,
    ))
}

/// Attachment states of messages, by message id (at most 100).
#[utoipa::path(post, path = "/external-chats/{chat_id}/messages/attachments", operation_id = "external_chat_message_attachments", params(("chat_id" = Uuid, Path)), request_body = Vec<Uuid>, responses((status = 200, body = Vec<MessageAttachments>)))]
pub async fn message_attachments<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Json(ids): Json<Vec<Uuid>>,
) -> Result<Json<Vec<MessageAttachments>>, ApiError> {
    Ok(Json(
        state
            .service
            .message_attachments(&access.entity_access_receipt, &ids)
            .await?,
    ))
}

/// Stop syncing the chat, locally. Owner only, in their own session.
#[utoipa::path(delete, path = "/external-chats/{chat_id}", operation_id = "external_chat_remove", params(("chat_id" = Uuid, Path)), responses((status = 204)))]
pub async fn remove<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: ExternalChatAccessLevelExtractor<OwnerAccessLevel, Eas, Auth>,
) -> Result<StatusCode, ApiError> {
    state
        .service
        .detach(
            &access.entity_access_receipt,
            authority(&auth.authorization),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// List external chats the caller can view, including without a provider account.
#[utoipa::path(get, path = "/external-chats", operation_id = "external_chats", responses((status = 200, body = Vec<ExternalChatSummary>)))]
pub async fn list<Eas, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
) -> Result<Json<Vec<ExternalChatSummary>>, ApiError> {
    Ok(Json(
        state
            .service
            .adopted_groups(&auth.authorization.macro_user_id)
            .await?,
    ))
}

/// Stable timeline pagination.
#[derive(Deserialize, utoipa::IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct TimelineQuery {
    /// Last message id in the previous page.
    pub before: Option<Uuid>,
    /// Page size, up to [`PAGE_LIMIT`]; [`DEFAULT_PAGE`] when absent.
    pub limit: Option<i64>,
}

/// Newest-first timeline through ordinary view access.
#[utoipa::path(get, path = "/external-chats/{chat_id}/messages", operation_id = "external_chat_messages", params(("chat_id" = Uuid, Path), TimelineQuery), responses((status = 200, body = ExternalChatMessages)))]
pub async fn messages<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Query(query): Query<TimelineQuery>,
) -> Result<Json<ExternalChatMessages>, ApiError> {
    Ok(Json(
        state
            .service
            .messages(&access.entity_access_receipt, query.before, query.limit)
            .await?,
    ))
}

/// Path of one timeline message.
#[derive(Deserialize)]
pub struct MessagePath {
    /// Unused here; the access extractor reads it.
    pub chat_id: Uuid,
    /// The message.
    pub message_id: Uuid,
}

/// One message of the timeline, as the timeline shows it.
#[utoipa::path(get, path = "/external-chats/{chat_id}/messages/{message_id}", operation_id = "external_chat_message", params(("chat_id" = Uuid, Path), ("message_id" = Uuid, Path)), responses((status = 200, body = ExternalChatMessage)))]
pub async fn message<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Path(path): Path<MessagePath>,
) -> Result<Json<ExternalChatMessage>, ApiError> {
    Ok(Json(
        state
            .service
            .message(&access.entity_access_receipt, path.message_id)
            .await?,
    ))
}

/// Advance this viewer's read position.
#[utoipa::path(post, path = "/external-chats/{chat_id}/read", operation_id = "external_chat_read", params(("chat_id" = Uuid, Path)), request_body = MarkRead, responses((status = 204)))]
pub async fn mark_read<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
    Json(body): Json<MarkRead>,
) -> Result<StatusCode, ApiError> {
    state
        .service
        .mark_read(&access.entity_access_receipt, body.message_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Caller-owned pending, failed and uncertain sends.
#[utoipa::path(get, path = "/external-chats/{chat_id}/sends", operation_id = "external_chat_sends", params(("chat_id" = Uuid, Path)), responses((status = 200, body = Vec<SendProgress>)))]
pub async fn open_sends<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
) -> Result<Json<Vec<SendProgress>>, ApiError> {
    Ok(Json(
        state
            .service
            .open_sends(&access.entity_access_receipt)
            .await?,
    ))
}

/// Generic Share dialog policy.
#[utoipa::path(get, path = "/external-chats/{chat_id}/permissions", operation_id = "external_chat_permissions", params(("chat_id" = Uuid, Path)), responses((status = 200, body = SharePermissionV2)))]
pub async fn permissions<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    access: ExternalChatAccessLevelExtractor<ViewAccessLevel, Eas, Auth>,
) -> Result<Json<SharePermissionV2>, ApiError> {
    Ok(Json(
        state
            .service
            .permissions(&access.entity_access_receipt)
            .await?,
    ))
}

/// The owner, in their own session, updates link, team and channel sharing.
#[utoipa::path(patch, path = "/external-chats/{chat_id}/permissions", operation_id = "external_chat_update_permissions", params(("chat_id" = Uuid, Path)), request_body = UpdateSharePermissionRequestV2, responses((status = 204)))]
pub async fn update_permissions<Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<LinkedRouterState<Eas, Auth>>,
    auth: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: ExternalChatAccessLevelExtractor<OwnerAccessLevel, Eas, Auth>,
    Json(body): Json<UpdateSharePermissionRequestV2>,
) -> Result<StatusCode, ApiError> {
    state
        .service
        .update_permissions(
            &access.entity_access_receipt,
            &body,
            authority(&auth.authorization),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod test;
