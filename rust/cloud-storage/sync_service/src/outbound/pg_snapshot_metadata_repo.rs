use sqlx::PgPool;

use crate::domain::{
    models::{SnapshotMetadataUpdate, SnapshotMirrorError, SyncServiceStateResponse},
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
    async fn get_state(
        &self,
        document_id: &str,
    ) -> Result<SyncServiceStateResponse, SnapshotMirrorError> {
        let row = sqlx::query!(
            r#"
            SELECT
                s."initializedAt"::timestamptz as "initialized_at",
                s."versionId" as "version_id",
                s."snapshotSha256" as "snapshot_sha256",
                s."snapshotSizeBytes" as "snapshot_size_bytes",
                s."snapshotUpdatedAt"::timestamptz as "snapshot_updated_at"
            FROM "Document" d
            LEFT JOIN "DocumentSyncServiceState" s ON s."documentId" = d.id
            WHERE d.id = $1
              AND d."deletedAt" IS NULL
            "#,
            document_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "failed to load document sync-service state");
            SnapshotMirrorError::Internal("failed to load sync-service state".to_string())
        })?
        .ok_or_else(|| SnapshotMirrorError::NotFound("document not found".to_string()))?;

        let Some(initialized_at) = row.initialized_at else {
            return Ok(SyncServiceStateResponse::uninitialized());
        };

        Ok(SyncServiceStateResponse {
            initialized: true,
            initialized_at: Some(initialized_at),
            version_id: row.version_id,
            snapshot_sha256: row.snapshot_sha256,
            snapshot_size_bytes: row.snapshot_size_bytes,
            snapshot_updated_at: row.snapshot_updated_at,
        })
    }

    async fn current_snapshot_updated_at(
        &self,
        document_id: &str,
    ) -> Result<Option<chrono::DateTime<chrono::Utc>>, SnapshotMirrorError> {
        let row = sqlx::query!(
            r#"
            SELECT s."snapshotUpdatedAt"::timestamptz as "snapshot_updated_at"
            FROM "Document" d
            LEFT JOIN "DocumentSyncServiceState" s ON s."documentId" = d.id
            WHERE d.id = $1
              AND d."deletedAt" IS NULL
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

        Ok(row.snapshot_updated_at)
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

        let document = sqlx::query!(
            r#"
            SELECT "projectId" as "project_id"
            FROM "Document"
            WHERE id = $1
              AND "deletedAt" IS NULL
            "#,
            &document_id,
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "failed to load document before sync-service state update");
            SnapshotMirrorError::Internal("failed to load document".to_string())
        })?
        .ok_or_else(|| SnapshotMirrorError::NotFound("document not found".to_string()))?;

        let mirrored = sqlx::query!(
            r#"
            INSERT INTO "DocumentSyncServiceState" (
                "documentId",
                "versionId",
                "snapshotKey",
                "snapshotSha256",
                "snapshotSizeBytes",
                "snapshotUpdatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ("documentId") DO UPDATE SET
                "versionId" = EXCLUDED."versionId",
                "snapshotKey" = EXCLUDED."snapshotKey",
                "snapshotSha256" = EXCLUDED."snapshotSha256",
                "snapshotSizeBytes" = EXCLUDED."snapshotSizeBytes",
                "snapshotUpdatedAt" = EXCLUDED."snapshotUpdatedAt",
                "updatedAt" = NOW()
            WHERE "DocumentSyncServiceState"."snapshotUpdatedAt" IS NULL
               OR "DocumentSyncServiceState"."snapshotUpdatedAt" <= EXCLUDED."snapshotUpdatedAt"
            RETURNING "documentId" as "document_id"
            "#,
            &document_id,
            &version_id,
            &snapshot_key,
            &sha256,
            size_bytes,
            snapshot_updated_at,
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "failed to upsert document sync-service state");
            SnapshotMirrorError::Internal("failed to update sync-service state".to_string())
        })?;

        if mirrored.is_none() {
            return Ok(false);
        }

        if bump_updated_at {
            sqlx::query!(
                r#"UPDATE "Document" SET "updatedAt" = NOW() WHERE id = $1"#,
                &document_id,
            )
            .execute(&mut *transaction)
            .await
            .map_err(|err| {
                tracing::error!(error=?err, "failed to update document timestamp");
                SnapshotMirrorError::Internal("failed to update document timestamp".to_string())
            })?;

            if let Some(project_id) = document.project_id.as_deref()
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
        }

        transaction.commit().await.map_err(|err| {
            tracing::error!(error=?err, "failed to commit sync-service snapshot transaction");
            SnapshotMirrorError::Internal("failed to commit transaction".to_string())
        })?;

        Ok(true)
    }
}
