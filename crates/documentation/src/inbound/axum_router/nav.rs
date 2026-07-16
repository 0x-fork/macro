use axum::{
    Json,
    extract::{Path, State},
};
use entity_access::{
    domain::{
        models::{EntityType, MemberTeamRole, ViewAccessLevel},
        ports::EntityAccessService,
    },
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use uuid::Uuid;

use crate::domain::{
    model::{CreateNavNodeArgs, DocumentationError, NavNode, NavNodeKind, UpdateNavNodeArgs},
    service::DocumentationService,
};

use super::DocumentationRouterState;

/// Request body for `POST /documentation/sites/{site_id}/nav`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct CreateNavNodeRequest {
    /// Whether to create a group or a page.
    pub kind: NavNodeKind,
    /// The display title.
    pub title: String,
    /// Parent group id, or omitted for top level.
    pub parent_id: Option<Uuid>,
    /// The page's URL path; derived from `title` when omitted (pages only).
    pub path: Option<String>,
    /// The backing markdown document (pages only). The caller must be able
    /// to view the document.
    pub document_id: Option<String>,
}

/// Adds a nav node (group or page) to a site. New nodes are appended to
/// the end of their sibling list; use the move endpoint to reorder.
#[utoipa::path(
    post,
    path = "/documentation/sites/{site_id}/nav",
    operation_id = "create_documentation_nav_node",
    params(
        ("site_id" = Uuid, Path, description = "The site to add the node to"),
    ),
    request_body = CreateNavNodeRequest,
    responses(
        (status = 200, body = NavNode),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id))]
pub async fn create_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    user: MacroUserExtractor,
    Path(site_id): Path<Uuid>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<CreateNavNodeRequest>,
) -> Result<Json<NavNode>, DocumentationError> {
    // Pages reference a document by id in the body, so the standard
    // path-based document extractors don't apply — mint the view receipt
    // for the backing document here instead. The receipt is the caller's
    // proof of access; without it any private document could be published
    // by guessing its id.
    let document_receipt = match req.document_id.as_deref() {
        Some(document_id) if req.kind == NavNodeKind::Page => Some(
            state
                .entity_access_service
                .generate_entity_access_receipt::<ViewAccessLevel>(
                    &user.macro_user_id.0,
                    None,
                    document_id,
                    EntityType::Document,
                )
                .await
                .map_err(|_| {
                    DocumentationError::DocumentNotUsable(
                        "no access to the backing document".to_string(),
                    )
                })?,
        ),
        _ => None,
    };

    let node = state
        .service
        .create_nav_node(
            access.entity_access_receipt,
            site_id,
            CreateNavNodeArgs {
                kind: req.kind,
                title: req.title,
                parent_id: req.parent_id,
                path: req.path,
                document_id: req.document_id,
            },
            document_receipt,
        )
        .await?;
    Ok(Json(node))
}

/// Request body for `PATCH /documentation/sites/{site_id}/nav/{node_id}`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct PatchNavNodeRequest {
    /// New title, if changing.
    pub title: Option<String>,
    /// New URL path, if changing (pages only).
    pub path: Option<String>,
}

/// Updates a nav node's title and/or path.
#[utoipa::path(
    patch,
    path = "/documentation/sites/{site_id}/nav/{node_id}",
    operation_id = "patch_documentation_nav_node",
    params(
        ("site_id" = Uuid, Path, description = "The site the node belongs to"),
        ("node_id" = Uuid, Path, description = "The node to update"),
    ),
    request_body = PatchNavNodeRequest,
    responses(
        (status = 200, body = NavNode),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id, node_id = %node_id))]
pub async fn patch_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path((site_id, node_id)): Path<(Uuid, Uuid)>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<PatchNavNodeRequest>,
) -> Result<Json<NavNode>, DocumentationError> {
    let node = state
        .service
        .update_nav_node(
            access.entity_access_receipt,
            site_id,
            node_id,
            UpdateNavNodeArgs {
                title: req.title,
                path: req.path,
            },
        )
        .await?;
    Ok(Json(node))
}

/// Request body for `PUT /documentation/sites/{site_id}/nav/{node_id}/move`.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
pub struct MoveNavNodeRequest {
    /// The new parent group, or `null` for top level.
    pub parent_id: Option<Uuid>,
    /// 0-based position among the new siblings (clamped to the list).
    pub position: i32,
}

/// Response for the move endpoint.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct MoveNavNodeResponse {
    /// The moved node id.
    pub node_id: Uuid,
}

/// Moves a nav node to a new parent and/or position.
#[utoipa::path(
    put,
    path = "/documentation/sites/{site_id}/nav/{node_id}/move",
    operation_id = "move_documentation_nav_node",
    params(
        ("site_id" = Uuid, Path, description = "The site the node belongs to"),
        ("node_id" = Uuid, Path, description = "The node to move"),
    ),
    request_body = MoveNavNodeRequest,
    responses(
        (status = 200, body = MoveNavNodeResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id, node_id = %node_id))]
pub async fn move_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path((site_id, node_id)): Path<(Uuid, Uuid)>,
    State(state): State<DocumentationRouterState<D, Eas>>,
    Json(req): Json<MoveNavNodeRequest>,
) -> Result<Json<MoveNavNodeResponse>, DocumentationError> {
    state
        .service
        .move_nav_node(
            access.entity_access_receipt,
            site_id,
            node_id,
            req.parent_id,
            req.position,
        )
        .await?;
    Ok(Json(MoveNavNodeResponse { node_id }))
}

/// Response for the delete endpoint.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct DeleteNavNodeResponse {
    /// The deleted node id.
    pub node_id: Uuid,
}

/// Deletes a nav node. Deleting a group deletes its children; backing
/// documents are never touched.
#[utoipa::path(
    delete,
    path = "/documentation/sites/{site_id}/nav/{node_id}",
    operation_id = "delete_documentation_nav_node",
    params(
        ("site_id" = Uuid, Path, description = "The site the node belongs to"),
        ("node_id" = Uuid, Path, description = "The node to delete"),
    ),
    responses(
        (status = 200, body = DeleteNavNodeResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(site_id = %site_id, node_id = %node_id))]
pub async fn delete_handler<D: DocumentationService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    Path((site_id, node_id)): Path<(Uuid, Uuid)>,
    State(state): State<DocumentationRouterState<D, Eas>>,
) -> Result<Json<DeleteNavNodeResponse>, DocumentationError> {
    state
        .service
        .delete_nav_node(access.entity_access_receipt, site_id, node_id)
        .await?;
    Ok(Json(DeleteNavNodeResponse { node_id }))
}
