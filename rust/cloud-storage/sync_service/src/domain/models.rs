use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Minimal sync-service document metadata needed by DSS snapshot mirroring.
pub struct SyncDocumentMetadata {
    pub version_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct BulkWakeupRequest {
    pub document_ids: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct BulkWakeupResponse {
    pub dispatched: usize,
}

/// Snapshot mirror request sent by the sync-service durable object into DSS.
pub struct PutSnapshotRequest {
    pub document_id: String,
    pub version_id: String,
    pub snapshot_updated_at_ms: i64,
    pub snapshot_updated_at: DateTime<Utc>,
    pub snapshot: Vec<u8>,
    pub bump_updated_at: bool,
}

/// Metadata persisted after a sync-service snapshot is mirrored.
pub struct SnapshotMetadataUpdate {
    pub document_id: String,
    pub version_id: String,
    pub snapshot_key: String,
    pub sha256: String,
    pub size_bytes: i64,
    pub snapshot_updated_at: DateTime<Utc>,
    pub bump_updated_at: bool,
}

/// Response returned after DSS attempts to mirror a sync-service snapshot.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMirrorResponse {
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_updated_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl SnapshotMirrorResponse {
    pub fn stale(snapshot_updated_at: DateTime<Utc>) -> Self {
        Self {
            accepted: false,
            snapshot_key: None,
            sha256: None,
            size_bytes: None,
            snapshot_updated_at: Some(snapshot_updated_at),
            reason: Some("stale snapshot".to_string()),
        }
    }
}

/// Domain-level error for DSS sync-service snapshot mirroring.
#[derive(Debug)]
pub enum SnapshotMirrorError {
    BadRequest(String),
    NotFound(String),
    BadGateway(String),
    Internal(String),
}

impl SnapshotMirrorError {
    pub fn reason(&self) -> &str {
        match self {
            Self::BadRequest(reason)
            | Self::NotFound(reason)
            | Self::BadGateway(reason)
            | Self::Internal(reason) => reason,
        }
    }
}
