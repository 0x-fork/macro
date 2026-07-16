use axum::{Json, extract::State};
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;

use crate::domain::{model::DocumentationError, service::DocumentationService};

use super::{DocumentationRouterState, SiteResponse};

/// Response for `GET /documentation/sites`.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct ListSitesResponse {
    /// The team's sites, newest first.
    pub sites: Vec<SiteResponse>,
}

/// Lists the caller team's documentation sites.
#[utoipa::path(
    get,
    path = "/documentation/sites",
    operation_id = "list_documentation_sites",
    responses(
        (status = 200, body = ListSitesResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<ListSitesResponse>, DocumentationError> {
    let sites = state
        .service
        .list_sites(access.entity_access_receipt)
        .await?
        .into_iter()
        .map(|site| SiteResponse::new(state.service.as_ref(), site))
        .collect();
    Ok(Json(ListSitesResponse { sites }))
}
