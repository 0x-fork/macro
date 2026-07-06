//! Unified thread routes, parent-generic.
//!
//! Mounted (by document_storage_service) at `/message_threads`:
//!
//! - `GET    /{entity_type}/{entity_id}` — list top-level threads
//! - `POST   /{entity_type}/{entity_id}` — post a top-level message or reply
//! - `GET    /{entity_type}/{entity_id}/thread/{thread_id}` — thread + replies
//! - `POST   /{entity_type}/{entity_id}/thread/{thread_id}/resolved` — set resolved
//! - `PUT    /{entity_type}/{entity_id}/message/{message_id}/reaction` — react
//! - `GET    /legacy/{source}/{legacy_thread_id}` — resolve a legacy comment
//!   thread (annotation bigint id / crm uuid) to its unified root message
//!
//! Authorization is against the *parent* entity: View (or channel membership)
//! to read, Comment (or channel membership) to write. This is the
//! parent-generic replacement for `ChannelAccessLevelExtractor`; channel
//! parents authorize exactly as before through their participant role.

use std::str::FromStr;
use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRef, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
};
use channel_sender::ChannelSender;
use chrono::{DateTime, Utc};
use entity_access::{
    domain::{
        models::{
            AccessError, CommentAccessLevel, EntityAccessReceipt, EntityType,
            MemberParticipantRole, RequiredPermission, ViewAccessLevel,
        },
        ports::EntityAccessService,
    },
    inbound::axum_extractors::EntityPermissionExtractor,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::models::{
    CountedReaction, LegacyThreadRef, PostThreadMessageRequest, PostThreadMessageResponse,
    SetReactionRequest, SetThreadResolvedRequest, ThreadMessage, ThreadParent, ThreadWithReplies,
};
use crate::domain::ports::{ThreadErr, ThreadService};

/// State for the unified thread router.
pub struct MessageThreadsRouterState<S, Svc> {
    service: Arc<S>,
    access_service: Arc<Svc>,
}

impl<S, Svc> Clone for MessageThreadsRouterState<S, Svc> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            access_service: self.access_service.clone(),
        }
    }
}

impl<S: ThreadService, Svc: EntityAccessService> MessageThreadsRouterState<S, Svc> {
    /// Create a router state.
    pub fn new(service: S, access_service: Arc<Svc>) -> Self {
        Self {
            service: Arc::new(service),
            access_service,
        }
    }
}

impl<S, Svc> FromRef<MessageThreadsRouterState<S, Svc>> for Arc<Svc> {
    fn from_ref(state: &MessageThreadsRouterState<S, Svc>) -> Self {
        state.access_service.clone()
    }
}

/// Handler error → HTTP status mapping.
#[derive(Debug, thiserror::Error)]
enum ThreadsHandlerErr {
    #[error("{0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("{0}")]
    NotFound(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<ThreadErr> for ThreadsHandlerErr {
    fn from(err: ThreadErr) -> Self {
        match err {
            ThreadErr::NotFound(msg) => Self::NotFound(msg.to_string()),
            ThreadErr::BadRequest(msg) => Self::BadRequest(msg.to_string()),
            ThreadErr::Repo(e) => Self::Internal(e),
        }
    }
}

impl From<AccessError> for ThreadsHandlerErr {
    fn from(err: AccessError) -> Self {
        match err {
            AccessError::Unauthorized => Self::Unauthorized,
            AccessError::NotFound(msg) => Self::NotFound(msg.to_string()),
            AccessError::BadRequest(msg) => Self::BadRequest(msg.to_string()),
            other => Self::Internal(anyhow::anyhow!(other)),
        }
    }
}

impl IntoResponse for ThreadsHandlerErr {
    fn into_response(self) -> axum::response::Response {
        let status = match &self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Internal(error) => {
                tracing::error!(?error, "thread handler error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        (status, self.to_string()).into_response()
    }
}

/// Build the parent from a validated receipt.
fn parent_from_receipt<T: RequiredPermission>(
    receipt: &EntityAccessReceipt<T>,
) -> Result<ThreadParent, ThreadsHandlerErr> {
    let entity = receipt.entity();
    ThreadParent::new(entity.entity_type, entity.entity_id.clone())
        .map_err(|e| ThreadsHandlerErr::BadRequest(e.to_string()))
}

/// View access: item-style View, or channel membership.
fn require_view<T: RequiredPermission>(
    receipt: &EntityAccessReceipt<T>,
) -> Result<(), ThreadsHandlerErr> {
    let permission = receipt.entity_permission();
    if permission.satisfies::<ViewAccessLevel>() || permission.satisfies::<MemberParticipantRole>()
    {
        Ok(())
    } else {
        Err(ThreadsHandlerErr::Unauthorized)
    }
}

/// Write access: Comment on items; membership on channels (channel members
/// only ever hold View-equivalent item levels, their write grant is the
/// membership itself).
fn require_post<T: RequiredPermission>(
    receipt: &EntityAccessReceipt<T>,
    parent: &ThreadParent,
) -> Result<(), ThreadsHandlerErr> {
    let permission = receipt.entity_permission();
    let allowed = if parent.entity_type == EntityType::Channel {
        permission.satisfies::<MemberParticipantRole>()
    } else {
        permission.satisfies::<CommentAccessLevel>()
    };
    if allowed {
        Ok(())
    } else {
        Err(ThreadsHandlerErr::Unauthorized)
    }
}

#[derive(Debug, Deserialize)]
struct ListThreadsQuery {
    /// Page size, clamped to [1, 100].
    limit: Option<i64>,
    /// Return threads created strictly before this timestamp.
    before: Option<DateTime<Utc>>,
}

/// Build the unified thread router.
pub fn message_threads_router<S, Svc, T>(state: MessageThreadsRouterState<S, Svc>) -> Router<T>
where
    S: ThreadService,
    Svc: EntityAccessService,
    T: Clone + Send + Sync + 'static,
{
    Router::new()
        .route(
            "/legacy/{source}/{legacy_thread_id}",
            get(get_legacy_thread_handler::<S, Svc>),
        )
        .route(
            "/{entity_type}/{entity_id}",
            get(list_threads_handler::<S, Svc>).post(post_message_handler::<S, Svc>),
        )
        .route(
            "/{entity_type}/{entity_id}/thread/{thread_id}",
            get(get_thread_handler::<S, Svc>),
        )
        .route(
            "/{entity_type}/{entity_id}/thread/{thread_id}/resolved",
            post(set_thread_resolved_handler::<S, Svc>),
        )
        .route(
            "/{entity_type}/{entity_id}/message/{message_id}/reaction",
            put(set_reaction_handler::<S, Svc>),
        )
        .with_state(state)
}

async fn list_threads_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    access: EntityPermissionExtractor<Svc>,
    Query(query): Query<ListThreadsQuery>,
) -> Result<Json<Vec<ThreadMessage>>, ThreadsHandlerErr> {
    let receipt = &access.entity_access_receipt;
    require_view(receipt)?;
    let parent = parent_from_receipt(receipt)?;

    let threads = state
        .service
        .list_threads(&parent, query.limit.unwrap_or(50), query.before)
        .await?;
    Ok(Json(threads))
}

async fn post_message_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    access: EntityPermissionExtractor<Svc>,
    Json(req): Json<PostThreadMessageRequest>,
) -> Result<(StatusCode, Json<PostThreadMessageResponse>), ThreadsHandlerErr> {
    let receipt = &access.entity_access_receipt;
    let parent = parent_from_receipt(receipt)?;
    require_post(receipt, &parent)?;

    let user = receipt
        .get_authenticated_user()
        .map_err(|_| ThreadsHandlerErr::Unauthorized)?;
    let actor = ChannelSender::new_from_user(user.clone());

    let response = state.service.post_message(actor, &parent, req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

async fn get_thread_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    access: EntityPermissionExtractor<Svc>,
    Path((_, _, thread_id)): Path<(String, String, Uuid)>,
) -> Result<Json<ThreadWithReplies>, ThreadsHandlerErr> {
    let receipt = &access.entity_access_receipt;
    require_view(receipt)?;
    let parent = parent_from_receipt(receipt)?;

    let thread = state.service.get_thread(&parent, thread_id).await?;
    Ok(Json(thread))
}

async fn set_thread_resolved_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    access: EntityPermissionExtractor<Svc>,
    Path((_, _, thread_id)): Path<(String, String, Uuid)>,
    Json(req): Json<SetThreadResolvedRequest>,
) -> Result<StatusCode, ThreadsHandlerErr> {
    let receipt = &access.entity_access_receipt;
    let parent = parent_from_receipt(receipt)?;
    require_post(receipt, &parent)?;

    state
        .service
        .set_thread_resolved(&parent, thread_id, req.resolved)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn set_reaction_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    access: EntityPermissionExtractor<Svc>,
    Path((_, _, message_id)): Path<(String, String, Uuid)>,
    Json(req): Json<SetReactionRequest>,
) -> Result<Json<Vec<CountedReaction>>, ThreadsHandlerErr> {
    let receipt = &access.entity_access_receipt;
    let parent = parent_from_receipt(receipt)?;
    require_post(receipt, &parent)?;

    let user = receipt
        .get_authenticated_user()
        .map_err(|_| ThreadsHandlerErr::Unauthorized)?;

    let reactions = state
        .service
        .set_reaction(
            user.clone(),
            &parent,
            message_id,
            req.emoji,
            req.active,
            req.nonce,
        )
        .await?;
    Ok(Json(reactions))
}

async fn get_legacy_thread_handler<S: ThreadService, Svc: EntityAccessService>(
    State(state): State<MessageThreadsRouterState<S, Svc>>,
    user: model_user::axum_extractor::OptionalMacroUserExtractor,
    Path((source, legacy_thread_id)): Path<(String, String)>,
) -> Result<Json<LegacyThreadRef>, ThreadsHandlerErr> {
    let legacy = state
        .service
        .get_legacy_thread(&source, &legacy_thread_id)
        .await?
        .ok_or_else(|| ThreadsHandlerErr::NotFound("legacy thread not found".to_string()))?;

    // Authorize against the resolved parent before revealing the mapping.
    let parent_type = EntityType::from_str(&legacy.parent_type)
        .map_err(|_| ThreadsHandlerErr::NotFound("legacy thread not found".to_string()))?;
    let permission = state
        .access_service
        .get_entity_permission(
            user.macro_user_id.as_ref().map(|u| &u.0),
            &legacy.parent_id,
            parent_type,
            None,
        )
        .await?;
    if !permission.satisfies::<ViewAccessLevel>()
        && !permission.satisfies::<MemberParticipantRole>()
    {
        return Err(ThreadsHandlerErr::Unauthorized);
    }

    Ok(Json(legacy))
}
