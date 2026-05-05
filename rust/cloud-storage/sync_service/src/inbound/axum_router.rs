use std::sync::Arc;

use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{post, put},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::domain::{
    models::{
        BulkWakeupRequest, BulkWakeupResponse, PutSnapshotRequest, SnapshotMirrorError,
        SnapshotMirrorResponse,
    },
    ports::{SyncSnapshotMirrorService, SyncWakeupService},
};

const VERSION_ID_HEADER: &str = "x-sync-service-version-id";
const SNAPSHOT_UPDATED_AT_MS_HEADER: &str = "x-sync-service-snapshot-updated-at-ms";
const BUMP_UPDATED_AT_HEADER: &str = "x-sync-service-bump-updated-at";

pub struct SyncServiceRouterState<Svc> {
    pub service: Arc<Svc>,
}

impl<Svc> Clone for SyncServiceRouterState<Svc> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

pub struct SyncSnapshotMirrorRouterState<Svc> {
    pub service: Arc<Svc>,
}

impl<Svc> Clone for SyncSnapshotMirrorRouterState<Svc> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

#[derive(Deserialize)]
pub struct DocumentParams {
    document_id: String,
}

pub fn sync_service_router<Svc, S>(state: SyncServiceRouterState<Svc>) -> Router<S>
where
    Svc: SyncWakeupService,
    S: Send + Sync + 'static,
{
    Router::new()
        .route("/wakeup", post(bulk_wakeup_handler::<Svc>))
        .with_state(state)
}

pub fn sync_snapshot_mirror_router<Svc, S>(state: SyncSnapshotMirrorRouterState<Svc>) -> Router<S>
where
    Svc: SyncSnapshotMirrorService,
    S: Send + Sync + 'static,
{
    Router::new()
        .route(
            "/documents/{document_id}/snapshot",
            put(put_snapshot_handler::<Svc>),
        )
        .route(
            "/documents/{document_id}/snapshot/backfill",
            post(backfill_snapshot_handler::<Svc>),
        )
        .with_state(state)
}

#[utoipa::path(
    tag = "sync_service",
    post,
    path = "/sync_service/wakeup",
    operation_id = "bulk_wakeup_sync_service_documents",
    request_body = BulkWakeupRequest,
    responses(
        (status = 202, description = "Wakeups accepted for fire-and-forget dispatch", body = BulkWakeupResponse),
        (status = 400, description = "Malformed request or missing internal auth header"),
        (status = 401, description = "Invalid internal auth header"),
    )
)]
pub async fn bulk_wakeup_handler<Svc>(
    State(state): State<SyncServiceRouterState<Svc>>,
    Json(request): Json<BulkWakeupRequest>,
) -> Response
where
    Svc: SyncWakeupService,
{
    let dispatched = state.service.bulk_wakeup(request.document_ids);

    (
        StatusCode::ACCEPTED,
        Json(BulkWakeupResponse { dispatched }),
    )
        .into_response()
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, Response> {
    headers
        .get(name)
        .ok_or_else(|| error_response(StatusCode::BAD_REQUEST, "missing required header"))?
        .to_str()
        .map_err(|_| error_response(StatusCode::BAD_REQUEST, "invalid header value"))
}

fn parse_snapshot_updated_at(headers: &HeaderMap) -> Result<(i64, DateTime<Utc>), Response> {
    let millis = header_str(headers, SNAPSHOT_UPDATED_AT_MS_HEADER)?
        .parse::<i64>()
        .map_err(|_| {
            error_response(StatusCode::BAD_REQUEST, "invalid snapshot timestamp header")
        })?;

    let timestamp = DateTime::<Utc>::from_timestamp_millis(millis).ok_or_else(|| {
        error_response(StatusCode::BAD_REQUEST, "invalid snapshot timestamp header")
    })?;

    Ok((millis, timestamp))
}

fn parse_bump_updated_at(headers: &HeaderMap) -> bool {
    headers
        .get(BUMP_UPDATED_AT_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| matches!(value, "true" | "1" | "yes"))
}

fn error_response(status: StatusCode, reason: impl Into<String>) -> Response {
    (
        status,
        Json(SnapshotMirrorResponse {
            accepted: false,
            snapshot_key: None,
            sha256: None,
            size_bytes: None,
            snapshot_updated_at: None,
            reason: Some(reason.into()),
        }),
    )
        .into_response()
}

fn mirror_error_response(error: SnapshotMirrorError) -> Response {
    let status = match &error {
        SnapshotMirrorError::BadRequest(_) => StatusCode::BAD_REQUEST,
        SnapshotMirrorError::NotFound(_) => StatusCode::NOT_FOUND,
        SnapshotMirrorError::BadGateway(_) => StatusCode::BAD_GATEWAY,
        SnapshotMirrorError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    error_response(status, error.reason().to_string())
}

pub async fn put_snapshot_handler<Svc>(
    State(state): State<SyncSnapshotMirrorRouterState<Svc>>,
    Path(DocumentParams { document_id }): Path<DocumentParams>,
    headers: HeaderMap,
    snapshot: Bytes,
) -> Response
where
    Svc: SyncSnapshotMirrorService,
{
    if snapshot.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "empty snapshot body");
    }

    let version_id = match header_str(&headers, VERSION_ID_HEADER) {
        Ok(value) => value.to_string(),
        Err(response) => return response,
    };

    let (snapshot_updated_at_ms, snapshot_updated_at) = match parse_snapshot_updated_at(&headers) {
        Ok(value) => value,
        Err(response) => return response,
    };

    match state
        .service
        .put_snapshot(PutSnapshotRequest {
            document_id,
            version_id,
            snapshot_updated_at_ms,
            snapshot_updated_at,
            snapshot: snapshot.to_vec(),
            bump_updated_at: parse_bump_updated_at(&headers),
        })
        .await
    {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => mirror_error_response(error),
    }
}

pub async fn backfill_snapshot_handler<Svc>(
    State(state): State<SyncSnapshotMirrorRouterState<Svc>>,
    Path(DocumentParams { document_id }): Path<DocumentParams>,
) -> Response
where
    Svc: SyncSnapshotMirrorService,
{
    match state.service.backfill_snapshot(document_id).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => mirror_error_response(error),
    }
}
