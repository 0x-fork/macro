use chrono::Utc;
use s3_key::build_sync_service_snapshot_key;
use sha2::{Digest, Sha256};

use super::{
    models::{
        PutSnapshotRequest, SnapshotMetadataUpdate, SnapshotMirrorError, SnapshotMirrorResponse,
    },
    ports::{SyncSnapshotMetadataRepo, SyncSnapshotSource, SyncSnapshotStore},
};

/// Domain service for mirroring sync-service snapshots into DSS-owned storage/metadata.
pub struct SyncSnapshotMirrorServiceImpl<Repo, Store, Source> {
    repo: Repo,
    store: Store,
    source: Source,
}

impl<Repo, Store, Source> SyncSnapshotMirrorServiceImpl<Repo, Store, Source> {
    pub fn new(repo: Repo, store: Store, source: Source) -> Self {
        Self {
            repo,
            store,
            source,
        }
    }
}

impl<Repo, Store, Source> SyncSnapshotMirrorServiceImpl<Repo, Store, Source>
where
    Repo: SyncSnapshotMetadataRepo,
    Store: SyncSnapshotStore,
    Source: SyncSnapshotSource,
{
    async fn write_snapshot(
        &self,
        request: PutSnapshotRequest,
    ) -> Result<SnapshotMirrorResponse, SnapshotMirrorError> {
        let PutSnapshotRequest {
            document_id,
            version_id,
            snapshot_updated_at_ms,
            snapshot_updated_at,
            snapshot,
            bump_updated_at,
        } = request;

        if snapshot.is_empty() {
            return Err(SnapshotMirrorError::BadRequest(
                "empty snapshot body".to_string(),
            ));
        }

        if self
            .repo
            .current_snapshot_updated_at(&document_id)
            .await?
            .is_some_and(|existing| existing > snapshot_updated_at)
        {
            return Ok(SnapshotMirrorResponse::stale(snapshot_updated_at));
        }

        let sha256 = hex::encode(Sha256::digest(&snapshot));
        let size_bytes = snapshot.len() as i64;
        let snapshot_key =
            build_sync_service_snapshot_key(&document_id, snapshot_updated_at_ms, &sha256);

        self.store
            .upload_snapshot(snapshot_key.clone(), snapshot)
            .await?;

        let updated = self
            .repo
            .mark_snapshot_mirrored(SnapshotMetadataUpdate {
                document_id,
                version_id,
                snapshot_key: snapshot_key.clone(),
                sha256: sha256.clone(),
                size_bytes,
                snapshot_updated_at,
                bump_updated_at,
            })
            .await?;

        if !updated {
            return Ok(SnapshotMirrorResponse::stale(snapshot_updated_at));
        }

        Ok(SnapshotMirrorResponse {
            accepted: true,
            snapshot_key: Some(snapshot_key),
            sha256: Some(sha256),
            size_bytes: Some(size_bytes),
            snapshot_updated_at: Some(snapshot_updated_at),
            reason: None,
        })
    }
}

impl<Repo, Store, Source> super::ports::SyncSnapshotMirrorService
    for SyncSnapshotMirrorServiceImpl<Repo, Store, Source>
where
    Repo: SyncSnapshotMetadataRepo,
    Store: SyncSnapshotStore,
    Source: SyncSnapshotSource,
{
    async fn put_snapshot(
        &self,
        request: PutSnapshotRequest,
    ) -> Result<SnapshotMirrorResponse, SnapshotMirrorError> {
        self.write_snapshot(request).await
    }

    async fn backfill_snapshot(
        &self,
        document_id: String,
    ) -> Result<SnapshotMirrorResponse, SnapshotMirrorError> {
        if !self.source.exists(&document_id).await? {
            return Err(SnapshotMirrorError::NotFound(
                "document not initialized in sync-service".to_string(),
            ));
        }

        let metadata = self.source.metadata(&document_id).await?;
        let snapshot = self.source.snapshot(&document_id).await?;
        let snapshot_updated_at = Utc::now();

        self.write_snapshot(PutSnapshotRequest {
            document_id,
            version_id: metadata.version_id,
            snapshot_updated_at_ms: snapshot_updated_at.timestamp_millis(),
            snapshot_updated_at,
            snapshot,
            bump_updated_at: false,
        })
        .await
    }
}
