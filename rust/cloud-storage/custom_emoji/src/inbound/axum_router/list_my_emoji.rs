//! `GET /custom_emoji` — list the emoji available to the caller (their teams).

use axum::{Json, extract::State};
use model_user::axum_extractor::MacroUserExtractor;

use super::{CustomEmojiDto, CustomEmojiRouterState};
use crate::domain::model::CustomEmojiError;
use crate::domain::ports::CustomEmojiService;

/// Lists the caller's available custom emoji (union of their teams).
#[utoipa::path(
    get,
    path = "/custom_emoji",
    operation_id = "list_custom_emoji",
    responses(
        (status = 200, body = Vec<CustomEmojiDto>),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<S: CustomEmojiService>(
    State(state): State<CustomEmojiRouterState<S>>,
    user: MacroUserExtractor,
) -> Result<Json<Vec<CustomEmojiDto>>, CustomEmojiError> {
    let emoji = state.service.list_for_user(&user.macro_user_id).await?;
    Ok(Json(emoji.into_iter().map(Into::into).collect()))
}
