use std::future::Future;

use chrono::{DateTime, Utc};

use super::models::{
    PutSnapshotRequest, SnapshotMetadataUpdate, SnapshotMirrorError, SnapshotMirrorResponse,
    SyncDocumentMetadata, SyncServiceStateResponse,
};

pub trait SyncWakeupService: Send + Sync + 'static {
    /// Dispatch wakeups for the given documents and return the number accepted for dispatch.
    ///
    /// Implementations should not wait for sync-service responses.
    fn bulk_wakeup(&self, document_ids: Vec<String>) -> usize;
}

pub trait SyncSnapshotMetadataRepo: Send + Sync + 'static {
    /// Return public DSS-side sync-service state for a document.
    fn get_state(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<SyncServiceStateResponse, SnapshotMirrorError>> + Send;

    /// Return the latest mirrored snapshot timestamp for a document.
    ///
    /// Missing documents should be reported as [`SnapshotMirrorError::NotFound`].
    fn current_snapshot_updated_at(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<Option<DateTime<Utc>>, SnapshotMirrorError>> + Send;

    /// Persist metadata for a mirrored snapshot.
    ///
    /// Returns `false` if the snapshot lost a stale-write race.
    fn mark_snapshot_mirrored(
        &self,
        update: SnapshotMetadataUpdate,
    ) -> impl Future<Output = Result<bool, SnapshotMirrorError>> + Send;
}

pub trait SyncSnapshotStore: Send + Sync + 'static {
    /// Store snapshot bytes at the given storage key.
    fn upload_snapshot(
        &self,
        snapshot_key: String,
        snapshot: Vec<u8>,
    ) -> impl Future<Output = Result<(), SnapshotMirrorError>> + Send;
}

pub trait SyncSnapshotSource: Send + Sync + 'static {
    /// Whether a document exists in sync-service.
    fn exists(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<bool, SnapshotMirrorError>> + Send;

    /// Fetch sync-service metadata for a document.
    fn metadata(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<SyncDocumentMetadata, SnapshotMirrorError>> + Send;

    /// Fetch a sync-service snapshot for a document.
    fn snapshot(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<Vec<u8>, SnapshotMirrorError>> + Send;
}

pub trait SyncSnapshotMirrorService: Send + Sync + 'static {
    /// Return public DSS-side sync-service state for a document.
    fn get_state(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<SyncServiceStateResponse, SnapshotMirrorError>> + Send;

    /// Mirror a sync-service snapshot into DSS storage/metadata.
    fn put_snapshot(
        &self,
        request: PutSnapshotRequest,
    ) -> impl Future<Output = Result<SnapshotMirrorResponse, SnapshotMirrorError>> + Send;

    /// Backfill DSS storage/metadata for an existing sync-service document.
    fn backfill_snapshot(
        &self,
        document_id: String,
    ) -> impl Future<Output = Result<SnapshotMirrorResponse, SnapshotMirrorError>> + Send;
}
