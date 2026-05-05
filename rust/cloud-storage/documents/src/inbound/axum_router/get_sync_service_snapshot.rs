//! Handler for `GET /documents/{document_id}/sync_service/snapshot`.

use axum::{Extension, Json, extract::Path, extract::State};
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::DocumentAccessExtractor;
use model::document::DocumentBasic;
use models_permissions::share_permission::access_level::ViewAccessLevel;

use super::{DocumentRouterState, Params};
use crate::domain::models::{DocumentError, SyncServiceSnapshotLocationResponse};
use crate::domain::ports::DocumentService;

/// Handler for `GET /documents/{document_id}/sync_service/snapshot`.
///
/// Returns a signed URL for the latest DSS-mirrored sync-service Loro snapshot.
#[utoipa::path(
    tag = "document",
    get,
    path = "/documents/{document_id}/sync_service/snapshot",
    operation_id = "get_sync_service_snapshot_location",
    params(("document_id" = String, Path, description = "Document ID")),
    responses(
        (status = 200, body = SyncServiceSnapshotLocationResponse),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 409, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(skip(state, access, document_context), err)]
pub async fn get_sync_service_snapshot_handler<T: DocumentService, Svc: EntityAccessService>(
    access: DocumentAccessExtractor<ViewAccessLevel, Svc>,
    State(state): State<DocumentRouterState<T, Svc>>,
    Extension(document_context): Extension<DocumentBasic>,
    Path(Params { document_id: _ }): Path<Params>,
) -> Result<Json<SyncServiceSnapshotLocationResponse>, DocumentError> {
    let response = state
        .service
        .get_sync_service_snapshot_location(&document_context, access.entity_access_receipt)
        .await?;

    Ok(Json(response))
}
