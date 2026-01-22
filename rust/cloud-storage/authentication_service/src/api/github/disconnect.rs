use axum::{
    Extension,
    extract::State,
    http::StatusCode,
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::{GitHubIntegrationError, unlink_github_account};
use model::user::UserContext;

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
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<StatusCode, GitHubIntegrationError> {
    tracing::info!("disconnect_github called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id)?;

    // Use github_integration to unlink the account
    unlink_github_account(
        &ctx.db,
        &*ctx.auth_client,
        &ctx.github_config,
        fusion_user_id,
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
