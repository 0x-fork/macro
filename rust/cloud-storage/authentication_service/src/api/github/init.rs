use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use crate::api::oauth2::OAuthState;
use model::{response::ErrorResponse, user::UserContext};
use github_integration::GitHubOAuthClient;

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct InitGitHubResponse {
    /// The OAuth authorization URL to redirect the user to
    pub authorization_url: String,
    /// The link ID for tracking the OAuth flow
    pub link_id: String,
}

/// Initiates GitHub OAuth flow for integration
#[utoipa::path(
    post,
    operation_id = "init_github",
    path = "/github/init",
    responses(
        (status = 200, body=InitGitHubResponse),
        (status = 400, body=ErrorResponse),
        (status = 429, body=ErrorResponse),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Response, Response> {
    tracing::info!("init_github called");

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

    // Check if user already has a GitHub link
    let existing_link = github_integration::db::get_link_by_fusionauth_user_id(
        &ctx.db,
        fusion_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to check existing GitHub link");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "unable to check existing GitHub link",
            }),
        )
            .into_response()
    })?;

    if existing_link.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "GitHub account already linked",
            }),
        )
            .into_response());
    }

    // Check count of in-progress links
    let count =
        macro_db_client::in_progress_user_link::count_existing_in_progress_user_links_for_user(
            &ctx.db,
            &user_context.fusion_user_id,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to count in progress user links");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to get current link count",
                }),
            )
                .into_response()
        })?;

    if count >= 5 {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                message: "too many in progress links. resolve them or wait 24 hours",
            }),
        )
            .into_response());
    }

    // Create in-progress link
    let link_id = macro_db_client::in_progress_user_link::create_in_progress_user_link(
        &ctx.db,
        &user_context.fusion_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to create in progress user link");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "unable to create in progress user link",
            }),
        )
            .into_response()
    })?;

    // Get GitHub integration identity provider ID from context
    let github_idp_id = &ctx.github_idp_id;

    // Build OAuth state
    let state = OAuthState {
        identity_provider_id: github_idp_id.clone(),
        link_id: Some(link_id.to_string()),
        original_url: None,
        is_mobile: None,
    };

    // Build GitHub OAuth URL
    let redirect_uri = crate::api::oauth2::format_redirect_uri("github");
    let oauth_client = GitHubOAuthClient::new();
    let authorization_url = oauth_client
        .construct_authorize_url(&ctx.github_config, &redirect_uri, state)
        .map_err(|e| {
            tracing::error!(error=?e, "failed to construct GitHub OAuth URL");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to construct OAuth URL",
                }),
            )
                .into_response()
        })?;

    Ok((
        StatusCode::OK,
        Json(InitGitHubResponse {
            authorization_url,
            link_id: link_id.to_string(),
        }),
    )
        .into_response())
}
