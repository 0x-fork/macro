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

use crate::domain::{
    model::{DocumentationError, SiteBuild},
    service::DocumentationService,
};

use super::DocumentationRouterState;

/// Starts a publish of the site. Rendering and upload run in the
/// background; poll the latest-build endpoint for progress. Returns `409`
/// when a build is already running.
#[utoipa::path(
    post,
    path = "/documentation/sites/{site_id}/publish",
    operation_id = "publish_documentation_site",
    params(
        ("site_id" = Uuid, Path, description = "The site to publish"),
    ),
    responses(
        (status = 200, body = SiteBuild),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn publish_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<SiteBuild>, DocumentationError> {
    let build = state
        .service
        .publish_site(access.entity_access_receipt, site_id)
        .await?;
    Ok(Json(build))
}

/// Response for the latest-build endpoint.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct LatestBuildResponse {
    /// The most recent build, or `null` when the site was never published.
    pub build: Option<SiteBuild>,
}

/// Fetches the site's most recent build (the UI polls this after publish).
#[utoipa::path(
    get,
    path = "/documentation/sites/{site_id}/builds/latest",
    operation_id = "get_documentation_site_latest_build",
    params(
        ("site_id" = Uuid, Path, description = "The site whose latest build to fetch"),
    ),
    responses(
        (status = 200, body = LatestBuildResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn latest_build_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<LatestBuildResponse>, DocumentationError> {
    let build = state
        .service
        .get_latest_build(access.entity_access_receipt, site_id)
        .await?;
    Ok(Json(LatestBuildResponse { build }))
}
