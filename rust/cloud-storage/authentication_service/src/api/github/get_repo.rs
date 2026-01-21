use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::{get_user_repository, GitHubOAuthClient};
use model::response::ErrorResponse;
use model::user::UserContext;
use model_entity::github::github_repo_id;

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoResponse {
    /// Foreign entity ID: github::repo:owner/name
    pub id: String,
    /// Repository name (without owner)
    pub name: String,
    /// Full repository name (owner/repo)
    pub full_name: String,
    /// Repository owner username
    pub owner: String,
    /// Owner avatar URL
    pub avatar_url: String,
    /// Repository description
    pub description: Option<String>,
    /// Whether the repository is private
    pub private: bool,
    /// HTML URL to the repository
    pub url: String,
    /// When the repository was last updated
    pub updated_at: String,
}

/// Get a specific GitHub repository by owner and name
#[utoipa::path(
    get,
    operation_id = "get_github_repo",
    path = "/github/repos/{owner}/{repo}",
    params(
        ("owner" = String, Path, description = "Repository owner (username or organization)"),
        ("repo" = String, Path, description = "Repository name")
    ),
    responses(
        (status = 200, body=GitHubRepoResponse, description = "Repository found"),
        (status = 403, body=ErrorResponse, description = "GitHub account not linked"),
        (status = 404, body=ErrorResponse, description = "Repository not found"),
        (status = 401, body=ErrorResponse, description = "Not authenticated"),
        (status = 500, body=ErrorResponse, description = "Server error"),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Path((owner, repo)): Path<(String, String)>,
) -> Result<Response, Response> {
    tracing::info!(owner=%owner, repo=%repo, "get_github_repo called");

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

    // Create OAuth client
    let oauth_client = GitHubOAuthClient::new();

    // Use github_integration to get the repository
    let repository = get_user_repository(
        &ctx.db,
        &*ctx.auth_client,
        &oauth_client,
        &ctx.github_config,
        fusion_user_id,
        &owner,
        &repo,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, owner=%owner, repo=%repo, "failed to get GitHub repository");

        let (status_code, message) = match e {
            github_integration::GitHubIntegrationError::NotLinked => {
                (StatusCode::FORBIDDEN, "GitHub account not linked")
            }
            github_integration::GitHubIntegrationError::RepositoryNotFound => {
                (StatusCode::NOT_FOUND, "repository not found or not accessible")
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "unable to retrieve GitHub repository"),
        };

        (
            status_code,
            Json(ErrorResponse {
                message,
            }),
        )
            .into_response()
    })?;

    // Convert to response format
    let repo_id = github_repo_id(&repository.owner.login, &repository.name)
        .map(|ns_id| ns_id.to_string())
        .unwrap_or_else(|_| format!("github::repo:{}", repository.full_name));

    let response = GitHubRepoResponse {
        id: repo_id,
        name: repository.name,
        full_name: repository.full_name.clone(),
        owner: repository.owner.login,
        avatar_url: repository.owner.avatar_url,
        description: repository.description,
        private: repository.private,
        url: repository.html_url,
        updated_at: repository.updated_at,
    };

    Ok((StatusCode::OK, Json(response)).into_response())
}
