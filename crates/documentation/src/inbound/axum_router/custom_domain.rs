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

use super::{DocumentationRouterState, SiteResponse};

/// Request body for `PUT /documentation/sites/{site_id}/custom-domain`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct SetCustomDomainRequest {
    /// The custom domain to serve the site from (e.g. `docs.example.com`),
    /// or `null` to clear it. Serving on the domain additionally requires
    /// pointing the domain's DNS at the docs-sites CDN.
    pub custom_domain: Option<String>,
}

/// Sets or clears a site's custom domain. Requires the caller to be an
/// Admin or Owner of the team.
#[utoipa::path(
    put,
    path = "/documentation/sites/{site_id}/custom-domain",
    operation_id = "set_documentation_site_custom_domain",
    params(
        ("site_id" = Uuid, Path, description = "The site to update"),
    ),
    request_body = SetCustomDomainRequest,
    responses(
        (status = 200, body = SiteResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<AdminTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<SetCustomDomainRequest>,
) -> Result<Json<SiteResponse>, DocumentationError> {
    let site = state
        .service
        .set_custom_domain(access.entity_access_receipt, site_id, req.custom_domain)
        .await?;
    Ok(Json(SiteResponse::new(state.service.as_ref(), site)))
}
