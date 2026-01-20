use axum::{
    Extension,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::unlink_github_account;
use model::{response::ErrorResponse, user::UserContext};

/// Disconnects GitHub account for the authenticated user
#[utoipa::path(
    delete,
    operation_id = "disconnect_github",
    path = "/github/link",
    responses(
        (status = 204, description = "GitHub account disconnected successfully"),
        (status = 404, body=ErrorResponse),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Response, Response> {
    tracing::info!("disconnect_github called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id).map_err(|e| {
        tracing::error!(error=?e, "invalid fusion_user_id format");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid user ID format",
            }),
        )
            .into_response()
    })?;

    // Use github_integration to unlink the account
    unlink_github_account(
        &ctx.db,
        &*ctx.auth_client,
        &ctx.github_config,
        fusion_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to unlink GitHub account");

        let (status_code, message) = match e {
            github_integration::GitHubIntegrationError::NotLinked => {
                (StatusCode::NOT_FOUND, "GitHub account not linked")
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "unable to disconnect GitHub account"),
        };

        (
            status_code,
            Json(ErrorResponse {
                message,
            }),
        )
            .into_response()
    })?;

    Ok(StatusCode::NO_CONTENT.into_response())
}
