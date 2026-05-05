use sqlx::PgPool;

use crate::domain::{
    models::{SnapshotMetadataUpdate, SnapshotMirrorError},
    ports::SyncSnapshotMetadataRepo,
};

pub struct PgSyncSnapshotMetadataRepo {
    pool: PgPool,
}

impl PgSyncSnapshotMetadataRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl SyncSnapshotMetadataRepo for PgSyncSnapshotMetadataRepo {
    async fn current_snapshot_updated_at(
        &self,
        document_id: &str,
    ) -> Result<Option<chrono::DateTime<chrono::Utc>>, SnapshotMirrorError> {
        let row = sqlx::query!(
            r#"
            SELECT "syncServiceSnapshotUpdatedAt"::timestamptz as "sync_service_snapshot_updated_at"
            FROM "Document"
            WHERE id = $1
              AND "deletedAt" IS NULL
            "#,
            document_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "failed to load document sync-service state");
            SnapshotMirrorError::Internal("failed to load document".to_string())
        })?
        .ok_or_else(|| SnapshotMirrorError::NotFound("document not found".to_string()))?;

        Ok(row.sync_service_snapshot_updated_at)
    }

    async fn mark_snapshot_mirrored(
        &self,
        update: SnapshotMetadataUpdate,
    ) -> Result<bool, SnapshotMirrorError> {
        let SnapshotMetadataUpdate {
            document_id,
            version_id,
            snapshot_key,
            sha256,
            size_bytes,
            snapshot_updated_at,
            bump_updated_at,
        } = update;

        let mut transaction = self.pool.begin().await.map_err(|err| {
            tracing::error!(error=?err, "failed to begin sync-service snapshot transaction");
            SnapshotMirrorError::Internal("failed to begin transaction".to_string())
        })?;

        let updated = sqlx::query!(
            r#"
            UPDATE "Document"
            SET
                "syncServiceInitializedAt" = COALESCE("syncServiceInitializedAt", NOW()),
                "syncServiceVersionId" = $2,
                "syncServiceSnapshotKey" = $3,
                "syncServiceSnapshotSha256" = $4,
                "syncServiceSnapshotSizeBytes" = $5,
                "syncServiceSnapshotUpdatedAt" = $6,
                "updatedAt" = CASE WHEN $7 THEN NOW() ELSE "updatedAt" END
            WHERE id = $1
              AND "deletedAt" IS NULL
              AND (
                "syncServiceSnapshotUpdatedAt" IS NULL
                OR "syncServiceSnapshotUpdatedAt" <= $6
              )
            RETURNING "projectId" as "project_id"
            "#,
            &document_id,
            &version_id,
            &snapshot_key,
            &sha256,
            size_bytes,
            snapshot_updated_at,
            bump_updated_at,
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "failed to update document sync-service state");
            SnapshotMirrorError::Internal("failed to update document".to_string())
        })?;

        let Some(updated) = updated else {
            return Ok(false);
        };

        if bump_updated_at
            && let Some(project_id) = updated.project_id.as_deref()
            && !project_id.is_empty()
        {
            sqlx::query!(
                r#"UPDATE "Project" SET "updatedAt" = NOW() WHERE id = $1"#,
                project_id,
            )
            .execute(&mut *transaction)
            .await
            .map_err(|err| {
                tracing::error!(error=?err, project_id=?project_id, "failed to update project timestamp");
                SnapshotMirrorError::Internal("failed to update project timestamp".to_string())
            })?;
        }

        transaction.commit().await.map_err(|err| {
            tracing::error!(error=?err, "failed to commit sync-service snapshot transaction");
            SnapshotMirrorError::Internal("failed to commit transaction".to_string())
        })?;

        Ok(true)
    }
}
