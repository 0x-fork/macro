//! Axum router for documentation endpoints.

/// Documentation availability for the caller's team.
pub mod availability;
/// Create a documentation site.
pub mod create_site;
/// Set or clear a site's custom domain.
pub mod custom_domain;
/// Delete a documentation site.
pub mod delete_site;
/// Fetch a site with its nav tree and latest build.
pub mod get_site;
/// List the caller team's sites.
pub mod list_sites;
/// Nav tree management (create / update / move / delete nodes).
pub mod nav;
/// Update a site's name/slug.
pub mod patch_site;
/// Publish a site and poll build status.
pub mod publish;

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::FromRef,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
};
use entity_access::domain::ports::EntityAccessService;
use model_error_response::ErrorResponse;

use crate::domain::{
    model::{DocumentationError, DocumentationSite, NavTreeNode, SiteBuild},
    service::DocumentationService,
};

/// Router state for the documentation endpoints.
pub struct DocumentationRouterState<D, Eas> {
    /// The documentation service.
    pub service: Arc<D>,
    /// The entity access service used by the team-scoped extractors and
    /// for minting document receipts.
    pub entity_access_service: Arc<Eas>,
}

impl<D, Eas> FromRef<DocumentationRouterState<D, Eas>> for Arc<Eas> {
    fn from_ref(state: &DocumentationRouterState<D, Eas>) -> Self {
        state.entity_access_service.clone()
    }
}

// Manual Clone so D, Eas don't need Clone (they're behind Arc).
impl<D, Eas> Clone for DocumentationRouterState<D, Eas> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            entity_access_service: self.entity_access_service.clone(),
        }
    }
}

/// Build the documentation router with all endpoints.
pub fn documentation_router<D, Eas, S>(state: DocumentationRouterState<D, Eas>) -> Router<S>
where
    D: DocumentationService,
    Eas: EntityAccessService,
    S: Send + Sync + 'static,
{
    Router::new()
        .route("/availability", get(availability::handler::<D, Eas>))
        .route("/sites", get(list_sites::handler::<D, Eas>))
        .route("/sites", post(create_site::handler::<D, Eas>))
        .route("/sites/{site_id}", get(get_site::handler::<D, Eas>))
        .route("/sites/{site_id}", patch(patch_site::handler::<D, Eas>))
        .route("/sites/{site_id}", delete(delete_site::handler::<D, Eas>))
        .route(
            "/sites/{site_id}/custom-domain",
            put(custom_domain::handler::<D, Eas>),
        )
        .route("/sites/{site_id}/nav", post(nav::create_handler::<D, Eas>))
        .route(
            "/sites/{site_id}/nav/{node_id}",
            patch(nav::patch_handler::<D, Eas>),
        )
        .route(
            "/sites/{site_id}/nav/{node_id}",
            delete(nav::delete_handler::<D, Eas>),
        )
        .route(
            "/sites/{site_id}/nav/{node_id}/move",
            put(nav::move_handler::<D, Eas>),
        )
        .route(
            "/sites/{site_id}/publish",
            post(publish::publish_handler::<D, Eas>),
        )
        .route(
            "/sites/{site_id}/builds/latest",
            get(publish::latest_build_handler::<D, Eas>),
        )
        .with_state(state)
}

/// A documentation site as returned by the API: the site plus its public
/// URL.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct SiteResponse {
    /// The site.
    #[serde(flatten)]
    pub site: DocumentationSite,
    /// The public URL the site is (or will be) served from.
    pub public_url: String,
}

impl SiteResponse {
    /// Builds the response, resolving the site's public URL.
    pub fn new<D: DocumentationService>(service: &D, site: DocumentationSite) -> Self {
        let public_url = service.site_public_url(&site);
        Self { site, public_url }
    }
}

/// A site with its nav tree and latest build, as returned by the API.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct SiteDetailResponse {
    /// The site plus its public URL.
    #[serde(flatten)]
    pub site: SiteResponse,
    /// The site's nav tree, ordered.
    pub nav: Vec<NavTreeNode>,
    /// The most recent build, if any.
    pub latest_build: Option<SiteBuild>,
}

impl IntoResponse for DocumentationError {
    fn into_response(self) -> Response {
        let status = match &self {
            DocumentationError::TeamPlanRequired | DocumentationError::NotEnabled => {
                StatusCode::FORBIDDEN
            }
            DocumentationError::SiteNotFound
            | DocumentationError::NodeNotFound
            | DocumentationError::BuildNotFound => StatusCode::NOT_FOUND,
            DocumentationError::SlugTaken
            | DocumentationError::PathTaken
            | DocumentationError::DomainTaken
            | DocumentationError::BuildInProgress => StatusCode::CONFLICT,
            DocumentationError::InvalidSlug(_)
            | DocumentationError::InvalidPath(_)
            | DocumentationError::InvalidDomain(_)
            | DocumentationError::DocumentNotUsable(_)
            | DocumentationError::NoPages
            | DocumentationError::BadRequest(_) => StatusCode::BAD_REQUEST,
            DocumentationError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let message = match &self {
            DocumentationError::Internal(_) => "internal server error".into(),
            other => other.to_string().into(),
        };
        (status, Json(ErrorResponse { message })).into_response()
    }
}
