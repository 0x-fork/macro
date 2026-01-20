use axum::{
    Extension,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use crate::api::context::ApiContext;
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

    // Fetch GitHub link from database
    let link = macro_db_client::github_links::get::get_link_by_fusionauth_user_id(
        &ctx.db,
        fusion_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to fetch GitHub link");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "unable to fetch GitHub link",
            }),
        )
            .into_response()
    })?;

    let link = link.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                message: "GitHub account not linked",
            }),
        )
            .into_response()
    })?;

    // Get GitHub integration identity provider ID from context
    let github_idp_id = &ctx.github_idp_id;

    // Unlink from FusionAuth
    ctx.auth_client
        .unlink_user(
            &user_context.fusion_user_id,
            github_idp_id,
            &link.github_user_id,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to unlink from FusionAuth");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to disconnect GitHub account",
                }),
            )
                .into_response()
        })?;

    // Delete link from database
    macro_db_client::github_links::delete::delete_link_by_id(&ctx.db, link.id)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to delete GitHub link from database");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to delete GitHub link",
                }),
            )
                .into_response()
        })?;

    Ok(StatusCode::NO_CONTENT.into_response())
}
