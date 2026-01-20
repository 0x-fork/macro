use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use model::{response::ErrorResponse, user::UserContext};

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct GitHubCredentialsResponse {
    pub access_token: String,
    pub github_username: String,
    pub github_user_id: String,
}

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

    // Retrieve identity provider links from FusionAuth
    let links = ctx
        .auth_client
        .get_links(&user_context.fusion_user_id, Some(github_idp_id.to_string()))
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to get FusionAuth links");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to retrieve GitHub credentials",
                }),
            )
                .into_response()
        })?;

    // Find the GitHub link
    let fusionauth_link = links.into_iter().find(|l| {
        l.identity_provider_id == *github_idp_id
            && l.identity_provider_user_id == link.github_user_id
    });

    let fusionauth_link = fusionauth_link.ok_or_else(|| {
        tracing::error!("GitHub link exists in database but not in FusionAuth");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "GitHub credentials not found",
            }),
        )
            .into_response()
    })?;

    Ok((
        StatusCode::OK,
        Json(GitHubCredentialsResponse {
            access_token: fusionauth_link.token,
            github_username: link.github_username,
            github_user_id: link.github_user_id,
        }),
    )
        .into_response())
}
