use std::sync::Arc;

use sync_service_hex::domain::{models::SnapshotMirrorError, ports::SyncSnapshotStore};

use crate::service::s3::S3;

#[derive(Clone)]
pub struct DssSyncSnapshotStore {
    s3_client: Arc<S3>,
}

impl DssSyncSnapshotStore {
    pub fn new(s3_client: Arc<S3>) -> Self {
        Self { s3_client }
    }
}

impl SyncSnapshotStore for DssSyncSnapshotStore {
    async fn upload_snapshot(
        &self,
        snapshot_key: String,
        snapshot: Vec<u8>,
    ) -> Result<(), SnapshotMirrorError> {
        self.s3_client
            .upload_document(&snapshot_key, snapshot)
            .await
            .map_err(|err| {
                tracing::error!(error=?err, snapshot_key=?snapshot_key, "failed to upload sync-service snapshot");
                SnapshotMirrorError::Internal("failed to upload snapshot".to_string())
            })
    }
}
