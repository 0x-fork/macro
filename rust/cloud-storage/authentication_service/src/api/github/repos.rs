use axum::{
    Extension, Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::{GitHubIntegrationError, GitHubOAuthClient, get_user_repositories};
use model::response::ErrorResponse;
use model::user::UserContext;
use model_entity::github::github_repo_id;

/// Default number of repos to return per page
const DEFAULT_REPOS_PER_PAGE: u8 = 50;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct GetGitHubReposQuery {
    #[serde(default = "default_per_page")]
    pub per_page: u8,
}

fn default_per_page() -> u8 {
    DEFAULT_REPOS_PER_PAGE
}

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

/// Lists GitHub repositories accessible to the authenticated user
#[utoipa::path(
    get,
    operation_id = "list_github_repos",
    path = "/github/repos",
    params(GetGitHubReposQuery),
    responses(
        (status = 200, body=Vec<GitHubRepoResponse>),
        (status = 404, body=ErrorResponse, description = "GitHub account not linked"),
        (status = 401, body=ErrorResponse, description = "Not authenticated"),
        (status = 500, body=ErrorResponse, description = "Server error"),
    )
)]
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
    Query(query): Query<GetGitHubReposQuery>,
) -> Result<Json<Vec<GitHubRepoResponse>>, GitHubIntegrationError> {
    tracing::info!("list_github_repos called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id)?;

    // Create OAuth client
    let oauth_client = GitHubOAuthClient::new();

    // Use github_integration to get repositories
    let repositories = get_user_repositories(
        &ctx.db,
        &*ctx.auth_client,
        &oauth_client,
        &ctx.github_config,
        fusion_user_id,
        Some(query.per_page),
    )
    .await?;

    // Convert to response format
    let response: Vec<GitHubRepoResponse> = repositories
        .into_iter()
        .map(|repo| {
            let repo_id = github_repo_id(&repo.owner.login, &repo.name)
                .map(|ns_id| ns_id.to_string())
                .unwrap_or_else(|_| format!("github::repo:{}", repo.full_name));

            GitHubRepoResponse {
                id: repo_id,
                name: repo.name,
                full_name: repo.full_name,
                owner: repo.owner.login,
                avatar_url: repo.owner.avatar_url,
                description: repo.description,
                private: repo.private,
                url: repo.html_url,
                updated_at: repo.updated_at,
            }
        })
        .collect();

    Ok(Json(response))
}
