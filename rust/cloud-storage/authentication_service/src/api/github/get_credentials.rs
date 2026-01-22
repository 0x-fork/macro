use axum::{
    Extension, Json,
    extract::State,
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::{GitHubIntegrationError, get_github_credentials};
use model::user::UserContext;

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
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Json<GitHubCredentialsResponse>, GitHubIntegrationError> {
    tracing::info!("get_github_credentials called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id)?;

    // Use github_integration to get credentials
    let credentials = get_github_credentials(
        &ctx.db,
        &*ctx.auth_client,
        &ctx.github_config,
        fusion_user_id,
    )
    .await?;

    Ok(Json(credentials))
}
