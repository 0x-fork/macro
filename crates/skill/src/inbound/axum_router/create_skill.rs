//! Handler for `POST /skill/create_skill`.

use axum::{Json, extract::State};
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::ProjectBodyAccessLevelExtractorV2;
use macro_authorization::{MacroAuthorizationExtractor, MacroAuthorizationService, UserOrInternal};
use models_permissions::share_permission::access_level::EditAccessLevel;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::domain::models::{CreateSkillArgs, SkillError};
use crate::domain::ports::SkillCreationService;

use super::SkillRouterState;

/// Request body for creating a skill — a reusable markdown document of AI
/// instructions that can be attached to an AI chat input via a
/// `/<skillname>` slash command and injected into the AI system prompt.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillRequest {
    /// The name of the skill.
    pub skill_name: String,
    /// Markdown source text. Defaults to an empty skill document.
    pub markdown: Option<String>,
    /// Optional project ID to associate the skill with.
    pub project_id: Option<uuid::Uuid>,
}

/// Response for creating a skill.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillResponse {
    /// The document ID of the created skill.
    pub document_id: String,
}

/// Creates a skill document with initialized markdown content in one
/// backend-owned lifecycle. Skills are created personal; team sharing is
/// toggled separately via `PUT /documents/{document_id}/team_share`.
#[utoipa::path(
    tag = "skill",
    post,
    path = "/skill/create_skill",
    request_body = CreateSkillRequest,
    responses(
        (status = 200, body = inline(CreateSkillResponse)),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(skip(state, user, project), fields(user_id=?user.authorization.user.macro_user_id))]
pub async fn create_skill_handler<SkillSvc, ESvc, Auth>(
    State(state): State<SkillRouterState<SkillSvc, ESvc, Auth>>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    project: ProjectBodyAccessLevelExtractorV2<EditAccessLevel, CreateSkillRequest, ESvc, Auth>,
) -> Result<Json<CreateSkillResponse>, SkillError>
where
    SkillSvc: SkillCreationService,
    ESvc: EntityAccessService,
    Auth: MacroAuthorizationService,
{
    let req = project.into_inner();

    let skill = state
        .service
        .create_skill(
            user.authorization.user.macro_user_id.clone(),
            CreateSkillArgs {
                name: req.skill_name,
                markdown: req.markdown,
                project_id: req.project_id,
            },
        )
        .await?;

    Ok(Json(CreateSkillResponse {
        document_id: skill.document_id,
    }))
}
