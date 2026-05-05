use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use entity_access::inbound::axum_extractors::DocumentAccessExtractor;
use models_permissions::share_permission::access_level::ViewAccessLevel;
use sync_service_hex::domain::{
    ports::SyncSnapshotMirrorService, service::SyncSnapshotMirrorServiceImpl,
};

use crate::api::context::{ApiContext, EntityAccessService};
use crate::service::sync_service_snapshot::DssSyncSnapshotStore;

#[derive(serde::Deserialize)]
pub struct Params {
    pub document_id: String,
}

fn error_response(
    error: sync_service_hex::domain::models::SnapshotMirrorError,
) -> axum::response::Response {
    let status = match &error {
        sync_service_hex::domain::models::SnapshotMirrorError::BadRequest(_) => {
            StatusCode::BAD_REQUEST
        }
        sync_service_hex::domain::models::SnapshotMirrorError::NotFound(_) => StatusCode::NOT_FOUND,
        sync_service_hex::domain::models::SnapshotMirrorError::BadGateway(_) => {
            StatusCode::BAD_GATEWAY
        }
        sync_service_hex::domain::models::SnapshotMirrorError::Internal(_) => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    };

    model::response::GenericResponse::builder()
        .message(error.reason())
        .is_error(true)
        .send(status)
}

#[tracing::instrument(skip(_access, state), fields(document_id = %params.document_id))]
pub async fn get_state_handler(
    _access: DocumentAccessExtractor<ViewAccessLevel, EntityAccessService>,
    State(state): State<ApiContext>,
    Path(params): Path<Params>,
) -> axum::response::Response {
    let service = SyncSnapshotMirrorServiceImpl::new(
        sync_service_hex::outbound::pg_snapshot_metadata_repo::PgSyncSnapshotMetadataRepo::new(
            state.db.clone(),
        ),
        DssSyncSnapshotStore::new(state.s3_client.clone()),
        state.sync_service_client.as_ref().clone(),
    );

    match service.get_state(&params.document_id).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => error_response(error),
    }
}
