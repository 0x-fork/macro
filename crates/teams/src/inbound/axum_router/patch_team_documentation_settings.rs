use axum::{Json, extract::State};
use entity_access::{
    domain::{models::AdminTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;

use crate::domain::{
    model::{
        PatchTeamDocumentationSettingsRequest, PatchTeamDocumentationSettingsResponse, TeamError,
    },
    team_repo::TeamService,
};

use super::TeamRouterState;

/// Enables or disables the Documentation feature for the team.
/// Enabling requires the team to be on a team plan (a plan is set, the
/// team is paying, or the team is enterprise); disabling is always
/// allowed and leaves existing documentation sites and their published
/// output untouched. Requires the caller to be an Admin or Owner of
/// the team.
#[utoipa::path(
    patch,
    path = "/team/documentation",
    operation_id = "patch_team_documentation_settings",
    request_body = PatchTeamDocumentationSettingsRequest,
    responses(
        (status = 200, body = PatchTeamDocumentationSettingsResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<T: TeamService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<AdminTeamRole, Eas>,
    State(state): State<TeamRouterState<T, Eas>>,
    Json(req): Json<PatchTeamDocumentationSettingsRequest>,
) -> Result<Json<PatchTeamDocumentationSettingsResponse>, TeamError> {
    let response = state
        .service
        .set_team_documentation_enabled(access.entity_access_receipt, req.enabled)
        .await?;
    Ok(Json(response))
}
