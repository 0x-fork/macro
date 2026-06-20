//! HTTP endpoints for the chat coding-agent feature.
//!
//! * `GET    /coding/repositories`                  — repos the user can pick.
//! * `POST   /coding/chats/{chat_id}/repository`    — select a repo + pre-warm.
//! * `GET    /coding/chats/{chat_id}/repository`    — current selection/status.
//! * `DELETE /coding/chats/{chat_id}/repository`    — clear + tear down.
//!
//! Authentication is provided by the router's `attach_user` layer, which
//! populates `Extension<UserContext>`; handlers reject an empty user id.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use macro_user_id::user_id::MacroUserIdStr;
use model::user::UserContext;
use serde::{Deserialize, Serialize};

use crate::api::context::ApiContext;

/// A repository the user can have the coding agent work on.
#[derive(Debug, Serialize)]
pub struct RepositoryDto {
    /// `owner/name`.
    pub full_name: String,
    /// Repository owner login.
    pub owner: String,
    /// Repository name.
    pub name: String,
    /// Default branch, if known.
    pub default_branch: Option<String>,
}

/// Response for the repository list.
#[derive(Debug, Serialize)]
pub struct RepositoriesResponse {
    /// Repositories available to the user.
    pub repositories: Vec<RepositoryDto>,
}

/// Request to select a repository for a chat.
#[derive(Debug, Deserialize)]
pub struct SelectRepositoryRequest {
    /// The repository to select, as `owner/name`.
    pub repository: String,
}

/// The sandbox status for a chat.
#[derive(Debug, Serialize)]
pub struct SandboxStatusResponse {
    /// The selected repository (`owner/name`), if any.
    pub repository: Option<String>,
    /// The sandbox lifecycle status (`none`, `provisioning`, `ready`, …).
    pub status: String,
    /// The working branch in use, if a task has started.
    pub work_branch: Option<String>,
}

/// Router for the coding-agent endpoints.
pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/repositories", get(list_repositories))
        .route(
            "/chats/{chat_id}/repository",
            post(select_repository)
                .get(get_repository)
                .delete(clear_repository),
        )
}

fn user_id(user_context: &UserContext) -> Result<MacroUserIdStr<'static>, (StatusCode, String)> {
    MacroUserIdStr::try_from(user_context.user_id.clone())
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid user".to_string()))
}

fn map_err(e: coding_agent::CodingError) -> (StatusCode, String) {
    use coding_agent::CodingError;
    let status = match &e {
        CodingError::NoRepositorySelected => StatusCode::BAD_REQUEST,
        CodingError::MissingCredentials { .. } => StatusCode::PRECONDITION_REQUIRED,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, e.to_string())
}

fn status_response(record: coding_agent::SandboxRecord) -> SandboxStatusResponse {
    SandboxStatusResponse {
        repository: Some(record.repo),
        status: serde_json::to_value(record.status)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "none".to_string()),
        work_branch: record.work_branch,
    }
}

#[tracing::instrument(skip(ctx, user_context), err(Debug))]
async fn list_repositories(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
) -> Result<Json<RepositoriesResponse>, (StatusCode, String)> {
    let uid = user_id(&user_context)?;
    let repos = ctx
        .coding_session_service
        .list_repositories(uid.0.as_ref())
        .await
        .map_err(map_err)?;
    Ok(Json(RepositoriesResponse {
        repositories: repos
            .into_iter()
            .map(|r| RepositoryDto {
                full_name: r.full_name(),
                owner: r.owner,
                name: r.name,
                default_branch: r.default_branch,
            })
            .collect(),
    }))
}

#[tracing::instrument(skip(ctx, user_context, request), err(Debug))]
async fn select_repository(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Path(chat_id): Path<String>,
    Json(request): Json<SelectRepositoryRequest>,
) -> Result<Json<SandboxStatusResponse>, (StatusCode, String)> {
    let uid = user_id(&user_context)?;
    let repo = coding_agent::RepoRef::parse(&request.repository).ok_or((
        StatusCode::BAD_REQUEST,
        "repository must be in 'owner/name' form".to_string(),
    ))?;
    let record = ctx
        .coding_session_service
        .select_repository(&chat_id, uid.0.as_ref(), repo)
        .await
        .map_err(map_err)?;
    Ok(Json(status_response(record)))
}

#[tracing::instrument(skip(ctx, _user_context), err(Debug))]
async fn get_repository(
    State(ctx): State<ApiContext>,
    Extension(_user_context): Extension<UserContext>,
    Path(chat_id): Path<String>,
) -> Result<Json<Option<SandboxStatusResponse>>, (StatusCode, String)> {
    let record = ctx
        .coding_session_service
        .get_record(&chat_id)
        .await
        .map_err(map_err)?;
    Ok(Json(record.map(status_response)))
}

#[tracing::instrument(skip(ctx, _user_context), err(Debug))]
async fn clear_repository(
    State(ctx): State<ApiContext>,
    Extension(_user_context): Extension<UserContext>,
    Path(chat_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    ctx.coding_session_service
        .clear_repository(&chat_id)
        .await
        .map_err(map_err)?;
    Ok(StatusCode::NO_CONTENT)
}
