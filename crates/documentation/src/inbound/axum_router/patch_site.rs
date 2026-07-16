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
    model::{DocumentationError, UpdateSiteArgs},
    service::DocumentationService,
};

use super::{DocumentationRouterState, SiteResponse};

/// Request body for `PATCH /documentation/sites/{site_id}`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct PatchSiteRequest {
    /// New display name, if changing.
    pub name: Option<String>,
    /// New slug, if changing. Changing the slug moves the site's public
    /// URL and takes the old location down.
    pub slug: Option<String>,
}

/// Updates a site's name and/or slug.
#[utoipa::path(
    patch,
    path = "/documentation/sites/{site_id}",
    operation_id = "patch_documentation_site",
    params(
        ("site_id" = Uuid, Path, description = "The site to update"),
    ),
    request_body = PatchSiteRequest,
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
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<PatchSiteRequest>,
) -> Result<Json<SiteResponse>, DocumentationError> {
    let site = state
        .service
        .update_site(
            access.entity_access_receipt,
            site_id,
            UpdateSiteArgs {
                name: req.name,
                slug: req.slug,
            },
        )
        .await?;
    Ok(Json(SiteResponse::new(state.service.as_ref(), site)))
}
