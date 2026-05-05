use sync_service_hex::domain::{
    models::{SnapshotMirrorError, SyncDocumentMetadata},
    ports::SyncSnapshotSource,
};

use super::SyncServiceClient;

impl SyncSnapshotSource for SyncServiceClient {
    async fn exists(&self, document_id: &str) -> Result<bool, SnapshotMirrorError> {
        self.exists(document_id).await.map_err(|err| {
            tracing::error!(error=?err, "failed to check sync-service document existence");
            SnapshotMirrorError::BadGateway("failed to check sync-service".to_string())
        })
    }

    async fn metadata(
        &self,
        document_id: &str,
    ) -> Result<SyncDocumentMetadata, SnapshotMirrorError> {
        self.get_metadata(document_id)
            .await
            .map(|metadata| SyncDocumentMetadata {
                version_id: metadata.version_id,
            })
            .map_err(|err| {
                tracing::error!(error=?err, "failed to fetch sync-service metadata");
                SnapshotMirrorError::BadGateway("failed to fetch sync-service metadata".to_string())
            })
    }

    async fn snapshot(&self, document_id: &str) -> Result<Vec<u8>, SnapshotMirrorError> {
        let snapshot = self.get_snapshot(document_id).await.map_err(|err| {
            tracing::error!(error=?err, "failed to fetch sync-service snapshot");
            SnapshotMirrorError::BadGateway("failed to fetch sync-service snapshot".to_string())
        })?;

        if snapshot.is_empty() {
            return Err(SnapshotMirrorError::BadGateway(
                "sync-service returned empty snapshot".to_string(),
            ));
        }

        Ok(snapshot)
    }
}
