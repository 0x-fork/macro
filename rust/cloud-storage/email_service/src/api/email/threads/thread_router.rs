use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRef, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use email::{
    domain::{models::EmailErr, ports::EmailService},
    inbound::EmailPreviewState,
};
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::ThreadAccessLevelExtractor;
use model::response::ErrorResponse;
use models_permissions::share_permission::access_level::ViewAccessLevel;
use sqlx::PgPool;
use strum_macros::AsRefStr;
use thiserror::Error;
use uuid::Uuid;

/// Router state for thread endpoints.
pub struct EmailRouterState<T, Svc> {
    /// The email service implementation.
    pub email_service: Arc<T>,
    /// The entity access service for authorization.
    pub access_service: Arc<Svc>,
    /// The database pool (used by middleware for thread lookups).
    pub pool: PgPool,
}

impl<T, Svc> Clone for EmailRouterState<T, Svc> {
    fn clone(&self) -> Self {
        Self {
            email_service: self.email_service.clone(),
            access_service: self.access_service.clone(),
            pool: self.pool.clone(),
        }
    }
}

impl<T, Svc> FromRef<EmailRouterState<T, Svc>> for Arc<Svc> {
    fn from_ref(state: &EmailRouterState<T, Svc>) -> Self {
        state.access_service.clone()
    }
}

impl<T: EmailService, Svc> FromRef<EmailRouterState<T, Svc>> for EmailPreviewState<T> {
    fn from_ref(state: &EmailRouterState<T, Svc>) -> Self {
        EmailPreviewState {
            inner: state.email_service.clone(),
        }
    }
}

/// Build the thread router.
pub fn thread_router<T, Svc, S>(state: EmailRouterState<T, Svc>) -> Router<S>
where
    T: EmailService,
    Svc: EntityAccessService,
    S: Send + Sync + 'static,
{
    let pool = state.pool.clone();

    Router::new()
        .route("/:thread_id", get(get_thread_handler::<T, Svc>))
        .layer(axum::middleware::from_fn_with_state(
            pool,
            macro_middleware::cloud_storage::thread::ensure_thread_exists::handler,
        ))
        .with_state(state)
}

/// The default number of messages to return in each thread.
const DEFAULT_MESSAGE_LIMIT: i64 = 5;
/// The max number of messages that can be returned in a response.
const MESSAGE_MAX: i64 = 100;

#[derive(Debug, serde::Deserialize)]
struct GetThreadParams {
    offset: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Error, AsRefStr)]
enum GetThreadError {
    #[error("Thread not found")]
    ThreadNotFound,

    #[error("Internal server error")]
    Internal(#[from] EmailErr),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl GetThreadError {
    fn should_log(&self) -> bool {
        !matches!(
            self,
            GetThreadError::ThreadNotFound | GetThreadError::ValidationError(_)
        )
    }

    fn log_if_needed(&self) {
        if self.should_log() {
            tracing::error!(error = ?self, variant = self.as_ref(), "GetThreadError");
        }
    }
}

impl IntoResponse for GetThreadError {
    fn into_response(self) -> Response {
        let status_code = match &self {
            GetThreadError::ThreadNotFound => StatusCode::NOT_FOUND,
            GetThreadError::ValidationError(_) => StatusCode::BAD_REQUEST,
            GetThreadError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (
            status_code,
            Json(ErrorResponse {
                message: self.to_string().as_str(),
            }),
        )
            .into_response()
    }
}

#[tracing::instrument(err, skip(state, receipt))]
async fn get_thread_handler<T: EmailService, Svc: EntityAccessService>(
    State(state): State<EmailRouterState<T, Svc>>,
    receipt: ThreadAccessLevelExtractor<ViewAccessLevel, Svc>,
    Path(thread_id): Path<Uuid>,
    Query(params): Query<GetThreadParams>,
) -> Result<Json<T::GetThreadResponse>, GetThreadError> {
    get_thread_handler_inner(state, receipt, thread_id, params)
        .await
        .inspect_err(|e| e.log_if_needed())
}

async fn get_thread_handler_inner<T: EmailService, Svc: EntityAccessService>(
    state: EmailRouterState<T, Svc>,
    receipt: ThreadAccessLevelExtractor<ViewAccessLevel, Svc>,
    thread_id: Uuid,
    params: GetThreadParams,
) -> Result<Json<T::GetThreadResponse>, GetThreadError> {
    if let Some(offset) = params.offset
        && offset < 0
    {
        return Err(GetThreadError::ValidationError(
            "offset must be non-negative".to_string(),
        ));
    }

    if let Some(limit) = params.limit {
        if limit <= 0 {
            return Err(GetThreadError::ValidationError(
                "limit must be positive".to_string(),
            ));
        }
        if limit > MESSAGE_MAX {
            return Err(GetThreadError::ValidationError(format!(
                "limit must not exceed {}",
                MESSAGE_MAX
            )));
        }
    }

    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(DEFAULT_MESSAGE_LIMIT);

    let access_level = match receipt.entity_access_receipt.entity_permission() {
        entity_access::domain::models::EntityPermission::AccessLevel { access_level } => {
            *access_level
        }
        _ => return Err(GetThreadError::ThreadNotFound),
    };

    let response = state
        .email_service
        .get_thread(thread_id, access_level, offset, limit)
        .await
        .map_err(|e| match e {
            EmailErr::NotFound => GetThreadError::ThreadNotFound,
            other => GetThreadError::Internal(other),
        })?;

    Ok(Json(response))
}
