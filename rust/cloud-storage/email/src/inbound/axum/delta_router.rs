use axum::{
    Json, Router,
    extract::{self, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
};
use axum_extra::extract::Cached;
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use models_pagination::{
    CursorOptionExt, CursorWithValAndFilter, SimpleSortMethod, TypeEraseCursor,
};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    domain::{models::EmailErr, ports::EmailService},
    inbound::axum::{
        api_types::{ApiDeltaOrder, ApiThreadDelta, GetThreadDeltaParams},
        axum_impls::MultiEmailLinkExtractor,
        previews_router::EmailRouterState,
    },
};

pub fn router<S, T>(state: EmailRouterState<T>) -> Router<S>
where
    S: Send + Sync,
    T: EmailService,
{
    Router::new()
        .route("/delta", get(delta_handler))
        .with_state(state)
}

#[derive(Debug, Error)]
pub enum GetThreadDeltaError {
    #[error("Internal error")]
    Internal(#[from] EmailErr),
}

impl IntoResponse for GetThreadDeltaError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!(error=?self, "get thread delta error");

        let status = match &self {
            GetThreadDeltaError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
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

/// The change feed backing the client-side email content cache: digests for
/// every thread across the caller's inboxes whose content changed at or after
/// `since`, keyset-paginated by `(watermark, thread_id)` ascending. Digests
/// only say *what* changed and when; content is hydrated through
/// `GET /email/threads/{thread_id}`.
#[utoipa::path(
    get,
    tag = "Threads",
    path = "/email/threads/delta",
    operation_id = "get_thread_delta",
    params(
        GetThreadDeltaParams,
        ("cursor" = Option<String>, Query, description = "Opaque cursor from the previous page's next_cursor."),
    ),
    responses(
        (status = 200, body = ApiThreadDelta),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(links, macro_user, service), fields(user_id=macro_user.macro_user_id.as_ref(), fusionauth_user_id=macro_user.user_context.fusion_user_id))]
async fn delta_handler<T: EmailService>(
    State(service): State<EmailRouterState<T>>,
    Cached(macro_user): Cached<MacroUserExtractor>,
    Cached(MultiEmailLinkExtractor(links, _)): Cached<MultiEmailLinkExtractor<T>>,
    extract::Query(params): extract::Query<GetThreadDeltaParams>,
    cursor: Option<CursorWithValAndFilter<Uuid, SimpleSortMethod, ()>>,
) -> Result<Json<ApiThreadDelta>, GetThreadDeltaError> {
    let page = service
        .service()
        .get_thread_delta(
            links.iter().map(|link| link.id).collect(),
            params.since,
            params.limit,
            params.order == Some(ApiDeltaOrder::Desc),
            cursor.into_query(SimpleSortMethod::UpdatedAt, ()),
        )
        .await?;

    Ok(Json(ApiThreadDelta::new(page.type_erase())))
}
