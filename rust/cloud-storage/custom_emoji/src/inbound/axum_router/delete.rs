//! `DELETE /custom_emoji/{id}` — soft-delete one of the caller's team emoji.

use axum::{
    extract::{Path, State},
    http::StatusCode,
};
use model_user::axum_extractor::MacroUserExtractor;
use uuid::Uuid;

use super::CustomEmojiRouterState;
use crate::domain::model::DeleteCustomEmojiError;
use crate::domain::ports::CustomEmojiService;

/// Soft-deletes a custom emoji (must belong to one of the caller's teams).
#[utoipa::path(
    delete,
    path = "/custom_emoji/{id}",
    operation_id = "delete_custom_emoji",
    params(("id" = Uuid, Path, description = "Custom emoji id")),
    responses(
        (status = 204),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<S: CustomEmojiService>(
    State(state): State<CustomEmojiRouterState<S>>,
    user: MacroUserExtractor,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, DeleteCustomEmojiError> {
    state.service.delete(&user.macro_user_id, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
