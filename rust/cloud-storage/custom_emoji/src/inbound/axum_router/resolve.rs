//! `POST /custom_emoji/resolve` — resolve emoji by id for rendering.
//!
//! Authenticated but NOT team-gated: anyone who receives a message containing a
//! custom emoji must be able to render it (render-on-encounter).

use axum::{Json, extract::State};
use model_user::axum_extractor::MacroUserExtractor;
use uuid::Uuid;

use super::{CustomEmojiDto, CustomEmojiRouterState};
use crate::domain::model::CustomEmojiError;
use crate::domain::ports::CustomEmojiService;

/// Request body for resolving custom emoji by id.
#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct ResolveCustomEmojiRequest {
    /// Custom emoji ids to resolve.
    pub ids: Vec<Uuid>,
}

/// Resolves custom emoji by id.
#[utoipa::path(
    post,
    path = "/custom_emoji/resolve",
    operation_id = "resolve_custom_emoji",
    responses(
        (status = 200, body = Vec<CustomEmojiDto>),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<S: CustomEmojiService>(
    State(state): State<CustomEmojiRouterState<S>>,
    _user: MacroUserExtractor,
    Json(req): Json<ResolveCustomEmojiRequest>,
) -> Result<Json<Vec<CustomEmojiDto>>, CustomEmojiError> {
    let emoji = state.service.resolve(&req.ids).await?;
    Ok(Json(emoji.into_iter().map(Into::into).collect()))
}
