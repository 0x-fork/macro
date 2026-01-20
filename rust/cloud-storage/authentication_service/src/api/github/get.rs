use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::get_github_credentials;
use model::{response::ErrorResponse, user::UserContext};

pub use github_integration::GitHubCredentialsResponse;

/// Gets GitHub access token and credentials for the authenticated user
#[utoipa::path(
    get,
    operation_id = "get_github_credentials",
    path = "/github/credentials",
    responses(
        (status = 200, body=GitHubCredentialsResponse),
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
    tracing::info!("get_github_credentials called");

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

    // Use github_integration to get credentials
    let credentials = get_github_credentials(
        &ctx.db,
        &*ctx.auth_client,
        &ctx.github_config,
        fusion_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to get GitHub credentials");

        let (status_code, message) = match e {
            github_integration::GitHubIntegrationError::NotLinked => {
                (StatusCode::NOT_FOUND, "GitHub account not linked")
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "unable to retrieve GitHub credentials"),
        };

        (
            status_code,
            Json(ErrorResponse {
                message,
            }),
        )
            .into_response()
    })?;

    Ok((
        StatusCode::OK,
        Json(credentials),
    )
        .into_response())
}
