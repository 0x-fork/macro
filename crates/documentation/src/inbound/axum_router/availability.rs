use axum::{Json, extract::State};
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;

use crate::domain::{
    model::{DocumentationAvailability, DocumentationError},
    service::DocumentationService,
};

use super::DocumentationRouterState;

/// Reports whether the Documentation feature is available to the caller's
/// team: the team-plan requirement and the team-level toggle. The frontend
/// uses this to choose between the enabled experience, the "ask an admin to
/// enable it" empty state, and the plan upsell.
#[utoipa::path(
    get,
    path = "/documentation/availability",
    operation_id = "get_documentation_availability",
    responses(
        (status = 200, body = DocumentationAvailability),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<DocumentationAvailability>, DocumentationError> {
    let availability = state
        .service
        .get_availability(access.entity_access_receipt)
        .await?;
    Ok(Json(availability))
}
