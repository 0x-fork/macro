use axum::{
    Json,
    extract::{Path, State},
};
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;
use uuid::Uuid;

use crate::domain::{model::DocumentationError, service::DocumentationService};

use super::{DocumentationRouterState, SiteDetailResponse, SiteResponse};

/// Fetches a site with its nav tree and latest build.
#[utoipa::path(
    get,
    path = "/documentation/sites/{site_id}",
    operation_id = "get_documentation_site",
    params(
        ("site_id" = Uuid, Path, description = "The site to fetch"),
    ),
    responses(
        (status = 200, body = SiteDetailResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<SiteDetailResponse>, DocumentationError> {
    let detail = state
        .service
        .get_site(access.entity_access_receipt, site_id)
        .await?;
    Ok(Json(SiteDetailResponse {
        site: SiteResponse::new(state.service.as_ref(), detail.site),
        nav: detail.nav,
        latest_build: detail.latest_build,
    }))
}
