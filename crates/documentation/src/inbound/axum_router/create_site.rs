use axum::{Json, extract::State};
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;

use crate::domain::{
    model::{CreateSiteArgs, DocumentationError},
    service::DocumentationService,
};

use super::{DocumentationRouterState, SiteResponse};

/// Request body for `POST /documentation/sites`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct CreateSiteRequest {
    /// The site's display name.
    pub name: String,
    /// Explicit slug (lowercase alphanumerics and hyphens); derived from
    /// `name` when omitted.
    pub slug: Option<String>,
}

/// Creates a documentation site for the caller's team.
#[utoipa::path(
    post,
    path = "/documentation/sites",
    operation_id = "create_documentation_site",
    request_body = CreateSiteRequest,
    responses(
        (status = 200, body = SiteResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<CreateSiteRequest>,
) -> Result<Json<SiteResponse>, DocumentationError> {
    let site = state
        .service
        .create_site(
            access.entity_access_receipt,
            CreateSiteArgs {
                name: req.name,
                slug: req.slug,
            },
        )
        .await?;
    Ok(Json(SiteResponse::new(state.service.as_ref(), site)))
}
