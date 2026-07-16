use axum::{
    Json,
    extract::{Path, State},
};
use entity_access::{
    domain::{models::AdminTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;
use uuid::Uuid;

use crate::domain::{model::DocumentationError, service::DocumentationService};

use super::DocumentationRouterState;

/// Response for `DELETE /documentation/sites/{site_id}`.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct DeleteSiteResponse {
    /// The deleted site id.
    pub site_id: Uuid,
}

/// Deletes a site and takes down its published output. Requires the caller
/// to be an Admin or Owner of the team.
#[utoipa::path(
    delete,
    path = "/documentation/sites/{site_id}",
    operation_id = "delete_documentation_site",
    params(
        ("site_id" = Uuid, Path, description = "The site to delete"),
    ),
    responses(
        (status = 200, body = DeleteSiteResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<AdminTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<DeleteSiteResponse>, DocumentationError> {
    state
        .service
        .delete_site(access.entity_access_receipt, site_id)
        .await?;
    Ok(Json(DeleteSiteResponse { site_id }))
}
