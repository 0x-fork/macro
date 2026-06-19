//! `POST /custom_emoji` — create a custom emoji for one of the caller's teams.

use axum::{Json, extract::State};
use model_user::axum_extractor::MacroUserExtractor;
use uuid::Uuid;

use super::{CustomEmojiDto, CustomEmojiRouterState};
use crate::domain::model::CreateCustomEmojiError;
use crate::domain::ports::CustomEmojiService;

/// Request body for creating a custom emoji.
#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct CreateCustomEmojiRequest {
    /// Team the emoji belongs to (caller must be a member).
    pub team_id: Uuid,
    /// The `:slug:` name (lowercase, `[a-z0-9_-]`, max 32 chars).
    pub slug: String,
    /// Static-file-service file id for the already-uploaded image.
    pub sfs_file_id: String,
}

/// Creates a custom emoji.
#[utoipa::path(
    post,
    path = "/custom_emoji",
    operation_id = "create_custom_emoji",
    responses(
        (status = 200, body = CustomEmojiDto),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 403, body = model_error_response::ErrorResponse),
        (status = 409, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<S: CustomEmojiService>(
    State(state): State<CustomEmojiRouterState<S>>,
    user: MacroUserExtractor,
    Json(req): Json<CreateCustomEmojiRequest>,
) -> Result<Json<CustomEmojiDto>, CreateCustomEmojiError> {
    let emoji = state
        .service
        .create(
            &user.macro_user_id,
            &req.team_id,
            &req.slug,
            &req.sfs_file_id,
        )
        .await?;
    Ok(Json(emoji.into()))
}
