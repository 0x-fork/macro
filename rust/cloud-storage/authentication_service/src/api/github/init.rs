use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use crate::api::oauth2::OAuthState;
use github_integration::GitHubOAuthClient;
use model::response::ErrorResponse;
use model::user::UserContext;

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct InitGitHubResponse {
    /// The OAuth authorization URL to redirect the user to
    pub authorization_url: String,
    /// The link ID for tracking the OAuth flow
    pub link_id: String,
}

/// Error type for init GitHub operations
#[derive(thiserror::Error, Debug)]
pub enum InitGitHubError {
    /// Invalid user ID format
    #[error("invalid user ID format")]
    InvalidUserId(#[from] uuid::Error),
    /// GitHub account already linked
    #[error("GitHub account already linked")]
    AlreadyLinked,
    /// Too many in-progress links
    #[error("too many in progress links")]
    TooManyInProgressLinks,
    /// Failed to construct OAuth URL
    #[error("failed to construct OAuth URL: {0}")]
    OAuthUrlError(#[from] serde_json::Error),
    /// Database error
    #[error("database error: {0}")]
    DatabaseError(#[from] anyhow::Error),
}

impl IntoResponse for InitGitHubError {
    fn into_response(self) -> Response {
        let (status_code, message): (StatusCode, &str) = match &self {
            InitGitHubError::InvalidUserId(_) => {
                (StatusCode::BAD_REQUEST, "invalid user ID format")
            }
            InitGitHubError::AlreadyLinked => {
                (StatusCode::BAD_REQUEST, "GitHub account already linked")
            }
            InitGitHubError::TooManyInProgressLinks => {
                (StatusCode::TOO_MANY_REQUESTS, "too many in progress links. resolve them or wait 24 hours")
            }
            InitGitHubError::OAuthUrlError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "unable to construct OAuth URL")
            }
            InitGitHubError::DatabaseError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
        };

        (
            status_code,
            Json(ErrorResponse { message }),
        )
            .into_response()
    }
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
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Json<InitGitHubResponse>, InitGitHubError> {
    tracing::info!("init_github called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id)?;

    // Check if user already has a GitHub link
    let existing_link = github_integration::db::get_link_by_fusionauth_user_id(
        &ctx.db,
        fusion_user_id,
    )
    .await?;

    if existing_link.is_some() {
        return Err(InitGitHubError::AlreadyLinked);
    }

    // Check count of in-progress links
    let count =
        macro_db_client::in_progress_user_link::count_existing_in_progress_user_links_for_user(
            &ctx.db,
            &user_context.fusion_user_id,
        )
        .await?;

    if count >= 5 {
        return Err(InitGitHubError::TooManyInProgressLinks);
    }

    // Create in-progress link
    let link_id = macro_db_client::in_progress_user_link::create_in_progress_user_link(
        &ctx.db,
        &user_context.fusion_user_id,
    )
    .await?;

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
        .construct_authorize_url(&ctx.github_config, &redirect_uri, state)?;

    Ok(Json(InitGitHubResponse {
        authorization_url,
        link_id: link_id.to_string(),
    }))
}
