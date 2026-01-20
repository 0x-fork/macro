use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::api::context::ApiContext;
use model::{response::ErrorResponse, user::UserContext};

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
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id, fusion_user_id=%user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> Result<Response, Response> {
    tracing::info!("list_github_links called");

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

    let link = github_integration::db::get_link_by_fusionauth_user_id(
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

    Ok((StatusCode::OK, Json(ListGitHubLinksResponse { links })).into_response())
}
