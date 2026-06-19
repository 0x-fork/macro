//! Axum router for custom emoji endpoints.

/// Create a custom emoji.
pub mod create;
/// Soft-delete a custom emoji.
pub mod delete;
/// List the caller's available custom emoji.
pub mod list_my_emoji;
/// Resolve custom emoji by id (for rendering).
pub mod resolve;

use std::sync::Arc;

use axum::{
    Json, Router,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use model_error_response::ErrorResponse;
use uuid::Uuid;

use crate::domain::model::{
    CreateCustomEmojiError, CustomEmoji, CustomEmojiError, DeleteCustomEmojiError,
};
use crate::domain::ports::CustomEmojiService;

/// Router state holding the custom emoji service.
pub struct CustomEmojiRouterState<S> {
    /// The custom emoji service implementation.
    pub service: Arc<S>,
}

// Manual Clone so `S` need not be Clone (it's behind an Arc).
impl<S> Clone for CustomEmojiRouterState<S> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

/// API representation of a custom emoji; the frontend derives the image URL from `sfs_file_id`.
#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct CustomEmojiDto {
    /// Immutable id referenced by messages.
    pub id: Uuid,
    /// The owning team.
    pub team_id: Uuid,
    /// The `:slug:` name.
    pub slug: String,
    /// Static-file-service file id for the image.
    pub sfs_file_id: String,
}

impl From<CustomEmoji> for CustomEmojiDto {
    fn from(emoji: CustomEmoji) -> Self {
        Self {
            id: emoji.id,
            team_id: emoji.team_id,
            slug: emoji.slug,
            sfs_file_id: emoji.sfs_file_id,
        }
    }
}

/// Builds the custom emoji router.
pub fn custom_emoji_router<S, St>(state: CustomEmojiRouterState<S>) -> Router<St>
where
    S: CustomEmojiService,
    St: Send + Sync + 'static,
{
    Router::new()
        .route("/", post(create::handler::<S>))
        .route("/", get(list_my_emoji::handler::<S>))
        .route("/resolve", post(resolve::handler::<S>))
        .route("/{id}", delete(delete::handler::<S>))
        .with_state(state)
}

fn server_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            message: "internal server error".into(),
        }),
    )
        .into_response()
}

impl IntoResponse for CustomEmojiError {
    fn into_response(self) -> Response {
        match self {
            CustomEmojiError::TooManyIds { .. } => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: self.to_string().into(),
                }),
            )
                .into_response(),
            CustomEmojiError::StorageLayerError(_) => server_error(),
        }
    }
}

impl IntoResponse for CreateCustomEmojiError {
    fn into_response(self) -> Response {
        match self {
            CreateCustomEmojiError::InvalidSlug(_) => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: self.to_string().into(),
                }),
            )
                .into_response(),
            CreateCustomEmojiError::NotTeamMember(_) => (
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    message: "not a member of this team".into(),
                }),
            )
                .into_response(),
            CreateCustomEmojiError::SlugAlreadyExists => (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    message: "slug already in use for this team".into(),
                }),
            )
                .into_response(),
            CreateCustomEmojiError::Repo(_) | CreateCustomEmojiError::StorageLayerError(_) => {
                server_error()
            }
        }
    }
}

impl IntoResponse for DeleteCustomEmojiError {
    fn into_response(self) -> Response {
        match self {
            DeleteCustomEmojiError::NotFound => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: "custom emoji does not exist".into(),
                }),
            )
                .into_response(),
            DeleteCustomEmojiError::StorageLayerError(_) => server_error(),
        }
    }
}
