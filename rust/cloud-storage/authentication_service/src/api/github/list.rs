use axum::{
    Extension, Json,
    extract::State,
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use github_integration::GitHubIntegrationError;
use model::response::ErrorResponse;
use model::user::UserContext;

pub use github_integration::GitHubLinkInfo;

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct ListGitHubLinksResponse {
    pub links: Vec<GitHubLinkInfo>,
}

/// Lists GitHub links for the authenticated user (returns 0 or 1 link due to single account constraint)
#[utoipa::path(
    get,
    operation_id = "list_github_links",
    path = "/github/links",
    responses(
        (status = 200, body=ListGitHubLinksResponse),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Json<ListGitHubLinksResponse>, GitHubIntegrationError> {
    tracing::info!("list_github_links called");

    // Parse fusion_user_id to UUID
    let fusion_user_id = Uuid::parse_str(&user_context.fusion_user_id)?;

    let link = github_integration::db::get_link_by_fusionauth_user_id(
        &ctx.db,
        fusion_user_id,
    )
    .await?;

    let links = if let Some(link) = link {
        vec![GitHubLinkInfo {
            id: link.id.to_string(),
            github_username: link.github_username,
            github_user_id: link.github_user_id,
            created_at: link.created_at,
        }]
    } else {
        vec![]
    };

    Ok(Json(ListGitHubLinksResponse { links }))
}
