use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use axum_extra::extract::Cached;
use macro_authorization::{
    MacroAuthorizationExtractor, MacroAuthorizationService, MacroAuthorizationState, UserOrInternal,
};
use model_error_response::ErrorResponse;
use thiserror::Error;
use uuid::Uuid;

use crate::domain::{
    models::{EmailErr, InboxUnreadSignalCount},
    ports::EmailUserService,
};

use super::previews_router::EmailRouterState;

/// Unread Signal-view thread count for one of the caller's inboxes.
#[derive(serde::Serialize, serde::Deserialize, Debug, utoipa::ToSchema)]
pub struct ApiInboxUnreadCount {
    /// The inbox (email link) the count belongs to.
    pub link_id: Uuid,
    /// Unread signal threads currently visible in that inbox's inbox view.
    pub unread_count: i64,
}

impl From<InboxUnreadSignalCount> for ApiInboxUnreadCount {
    fn from(count: InboxUnreadSignalCount) -> Self {
        ApiInboxUnreadCount {
            link_id: count.link_id,
            unread_count: count.unread_count,
        }
    }
}

/// Response body for the per-inbox unread Signal counts.
#[derive(serde::Serialize, serde::Deserialize, Debug, utoipa::ToSchema)]
pub struct ListUnreadCountsResponse {
    /// One entry per inbox accessible to the caller, including inboxes with
    /// nothing unread.
    pub counts: Vec<ApiInboxUnreadCount>,
    /// The sum across every inbox, for clients showing a single badge.
    pub total: i64,
}

/// Errors from the unread counts handler.
#[derive(Debug, Error)]
pub enum UnreadCountsError {
    /// Internal error.
    #[error("Internal error")]
    Internal(EmailErr),
}

impl IntoResponse for UnreadCountsError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!(error=?self, "unread counts error");
        let message = self.to_string();
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}

impl From<EmailErr> for UnreadCountsError {
    fn from(err: EmailErr) -> Self {
        UnreadCountsError::Internal(err)
    }
}

/// Create the unread counts router with a `GET /unread-counts` handler.
pub fn unread_counts_router<S, T, Auth>() -> Router<S>
where
    S: Send + Sync + Clone + 'static,
    T: EmailUserService,
    Auth: MacroAuthorizationService,
    EmailRouterState<T>: axum::extract::FromRef<S>,
    MacroAuthorizationState<Auth>: axum::extract::FromRef<S>,
{
    Router::new().route("/unread-counts", get(unread_counts_handler::<T, Auth>))
}

/// Unread Signal-view thread counts for every inbox the caller can read.
#[utoipa::path(
    get,
    tag = "Links",
    path = "/email/links/unread-counts",
    operation_id = "list_unread_counts",
    responses(
        (status = 200, body = ListUnreadCountsResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn unread_counts_handler<T: EmailUserService, Auth: MacroAuthorizationService>(
    State(state): State<EmailRouterState<T>>,
    Cached(macro_user): Cached<MacroAuthorizationExtractor<Auth, UserOrInternal>>,
) -> Result<Json<ListUnreadCountsResponse>, UnreadCountsError> {
    let counts = state
        .inner
        .get_user_unread_signal_counts(macro_user.authorization.user.macro_user_id.clone())
        .await?;

    let total = counts.iter().map(|count| count.unread_count).sum();

    Ok(Json(ListUnreadCountsResponse {
        counts: counts.into_iter().map(Into::into).collect(),
        total,
    }))
}
