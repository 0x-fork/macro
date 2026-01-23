//! PostgreSQL implementation of the DocumentMetadataRepo trait.

use crate::domain::{
    models::{DocumentServiceErr, Result},
    ports::DocumentMetadataRepo,
};
use document_sub_type::DocumentSubType;
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};
use model::document::{
    DocumentBasic, DocumentMetadata, DocumentPreviewData, DocumentPreviewDataSubType,
    DocumentPreviewV2, WithDocumentId, response::GetDocumentListResult,
};
use sqlx::PgPool;
use std::{collections::HashSet, sync::Arc};
use system_properties::{StatusOption, SystemPropertyKey};

#[cfg(test)]
mod test;

/// PostgreSQL-backed repository for document metadata operations.
pub struct MetadataRepo {
    db: Arc<PgPool>,
}

impl MetadataRepo {
    /// Creates a new MetadataRepo with the given database pool.
    pub fn new(db: Arc<PgPool>) -> Self {
        Self { db }
    }
}

impl DocumentMetadataRepo for MetadataRepo {
    #[tracing::instrument(skip(self, _user_id), err)]
    async fn get_document_metadata(
        &self,
        document_id: &str,
        _user_id: MacroUserIdStr<'_>,
    ) -> Result<DocumentMetadata> {
        let document_metadata: DocumentMetadata = sqlx::query!(
            r#"
            SELECT
                d.id as "document_id",
                d.owner as "owner",
                COALESCE(db.id, di.id) as "document_version_id!",
                d.name as "document_name",
                d."branchedFromId" as "branched_from_id",
                d."branchedFromVersionId" as "branched_from_version_id",
                d."documentFamilyId" as "document_family_id",
                d."createdAt"::timestamptz as "created_at",
                d."updatedAt"::timestamptz as "updated_at",
                d."fileType" as "file_type",
                db.bom_parts as "document_bom?",
                di.modification_data as "modification_data?",
                d."projectId" as "project_id",
                p.name as "project_name?",
                di.sha as "sha?",
                dt.sub_type as "sub_type?: DocumentSubType"
            FROM
                "Document" d
            LEFT JOIN document_sub_type dt ON dt.document_id = d.id
            LEFT JOIN LATERAL (
                SELECT
                    i.id,
                    i.sha,
                    i."createdAt",
                    (
                        SELECT
                            imod."modificationData"
                        FROM
                            "DocumentInstanceModificationData" imod
                        WHERE
                            imod."documentInstanceId" = i.id
                    ) as modification_data,
                    i."updatedAt"
                FROM
                    "DocumentInstance" i
                WHERE
                    i."documentId" = d.id
                ORDER BY
                    i."createdAt" DESC
                LIMIT 1
            ) di ON true
            LEFT JOIN LATERAL (
                SELECT
                    b.id,
                    (
                        SELECT
                            json_agg(
                                json_build_object(
                                    'id', bp.id,
                                    'sha', bp.sha,
                                    'path', bp.path
                                )
                            )
                        FROM
                            "BomPart" bp
                        WHERE
                            bp."documentBomId" = b.id
                    ) as bom_parts
                FROM
                    "DocumentBom" b
                WHERE
                    b."documentId" = d.id
                ORDER BY
                    b."createdAt" DESC
                LIMIT 1
            ) db ON d."fileType" = 'docx'
            LEFT JOIN LATERAL (
                SELECT
                    p.name
                FROM "Project" p
                WHERE p.id = d."projectId"
            ) p ON d."projectId" IS NOT NULL
            WHERE
                d.id = $1
            LIMIT 1
            "#,
            document_id,
        )
        .try_map(|row| {
            Ok(DocumentMetadata {
                document_id: row.document_id,
                document_version_id: row.document_version_id,
                owner: MacroUserIdStr::parse_from_str(&row.owner)
                    .map_err(|e| sqlx::Error::Decode(Box::new(e)))?
                    .into_owned(),
                document_name: row.document_name,
                file_type: row.file_type,
                sha: row.sha,
                project_id: row.project_id,
                project_name: row.project_name,
                branched_from_id: row.branched_from_id,
                branched_from_version_id: row.branched_from_version_id,
                document_family_id: row.document_family_id,
                document_bom: row.document_bom,
                modification_data: row.modification_data,
                created_at: row.created_at,
                updated_at: row.updated_at,
                sub_type: row.sub_type,
            })
        })
        .fetch_optional(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?
        .ok_or(DocumentServiceErr::NotFound)?;

        Ok(document_metadata)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_basic(&self, document_id: &str) -> Result<DocumentBasic> {
        let document: DocumentBasic = sqlx::query!(
            r#"
            SELECT
                d.id as "document_id",
                d.owner,
                d.name as "document_name",
                d."branchedFromId" as "branched_from_id",
                d."branchedFromVersionId" as "branched_from_version_id",
                d."documentFamilyId" as "document_family_id",
                d."fileType" as "file_type",
                d."projectId" as "project_id",
                d."deletedAt"::timestamptz as "deleted_at"
            FROM
                "Document" d
            WHERE
                d.id = $1
            LIMIT 1
            "#,
            document_id,
        )
        .try_map(|row| {
            Ok(DocumentBasic {
                document_id: row.document_id,
                document_name: row.document_name,
                owner: MacroUserIdStr::parse_from_str(&row.owner)
                    .map_err(|e| sqlx::Error::Decode(Box::new(e)))?
                    .into_owned(),
                file_type: row.file_type,
                branched_from_id: row.branched_from_id,
                branched_from_version_id: row.branched_from_version_id,
                document_family_id: row.document_family_id,
                project_id: row.project_id,
                deleted_at: row.deleted_at,
            })
        })
        .fetch_optional(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?
        .ok_or(DocumentServiceErr::NotFound)?;

        Ok(document)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_list(
        &self,
        user_id: MacroUserIdStr<'_>,
    ) -> Result<Vec<GetDocumentListResult>> {
        let result = sqlx::query_as!(
            GetDocumentListResult,
            r#"
            SELECT
                d.id as "document_id",
                COALESCE(db.id, di.id) as "document_version_id!",
                d.name as "document_name",
                d."fileType" as "file_type",
                d."branchedFromId" as branched_from_id,
                d."branchedFromVersionId" as branched_from_version_id,
                d."documentFamilyId" as document_family_id,
                d."createdAt"::timestamptz as created_at,
                d."updatedAt"::timestamptz as updated_at
            FROM
                "Document" d
            LEFT JOIN LATERAL (
                SELECT
                    i.id
                FROM
                    "DocumentInstance" i
                WHERE
                    i."documentId" = d.id
                ORDER BY
                    i."createdAt" DESC
                LIMIT 1
            ) di ON d."fileType" IS DISTINCT FROM 'docx'
            LEFT JOIN LATERAL (
                SELECT
                    b.id
                FROM
                    "DocumentBom" b
                WHERE
                    b."documentId" = d.id
                ORDER BY
                    b."createdAt" DESC
                LIMIT 1
            ) db ON d."fileType" = 'docx'
            WHERE
                d.owner = $1 AND d."deletedAt" IS NULL
            "#,
            user_id.as_ref()
        )
        .fetch_all(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?;

        Ok(result)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_user_view_location(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'_>,
    ) -> Result<Option<String>> {
        let record = sqlx::query!(
            r#"
            SELECT location
            FROM "UserDocumentViewLocation"
            WHERE user_id = $1 AND document_id = $2
            "#,
            user_id.as_ref(),
            document_id
        )
        .fetch_optional(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?;

        Ok(record.map(|r| r.location))
    }

    #[tracing::instrument(skip(self, _user_id), err)]
    async fn get_extracted_text(
        &self,
        _user_id: MacroUserIdStr<'_>,
        document_id: &str,
    ) -> Result<Option<String>> {
        let text = sqlx::query!(
            r#"
            SELECT content FROM "DocumentText" WHERE "documentId" = $1
            "#,
            document_id
        )
        .fetch_optional(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?;

        Ok(text.map(|r| r.content))
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_batch_document_previews(
        &self,
        document_ids: &[String],
    ) -> Result<Vec<DocumentPreviewV2>> {
        let status_property_id = SystemPropertyKey::STATUS_UUID;
        let completed_option_id = StatusOption::COMPLETED_UUID.to_string();

        let rows = sqlx::query!(
            r#"
            SELECT
                d.id as "document_id!",
                d.name as "document_name!",
                d."fileType" as file_type,
                d.owner as "owner!",
                d."updatedAt"::timestamptz as "updated_at",
                dt.sub_type as "sub_type?: DocumentSubType",
                CASE
                    WHEN dt.sub_type = 'task'
                        AND ep_status.values->'value' ? $2
                    THEN true
                    WHEN dt.sub_type = 'task'
                    THEN false
                    ELSE NULL
                END as "is_completed"
            FROM "Document" d
            LEFT JOIN document_sub_type dt ON dt.document_id = d.id
            LEFT JOIN entity_properties ep_status
                ON dt.sub_type = 'task'
                AND ep_status.entity_id = d.id
                AND ep_status.entity_type = 'TASK'
                AND ep_status.property_definition_id = $3
            WHERE
                d."id" = ANY($1)
            "#,
            document_ids,
            completed_option_id,
            status_property_id,
        )
        .fetch_all(self.db.as_ref())
        .await
        .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?;

        let found_documents: Vec<DocumentPreviewData> = rows
            .into_iter()
            .map(|row| DocumentPreviewData {
                document_id: row.document_id,
                file_type: row.file_type,
                document_name: row.document_name,
                owner: row.owner,
                updated_at: row.updated_at,
                sub_type: DocumentPreviewDataSubType::from_db(row.sub_type, row.is_completed),
            })
            .collect();

        let found_docs: HashSet<String> = found_documents
            .iter()
            .map(|row| row.document_id.clone())
            .collect();

        let result: Vec<DocumentPreviewV2> = document_ids
            .iter()
            .map(|id| {
                if !found_docs.contains(id) {
                    DocumentPreviewV2::DoesNotExist(WithDocumentId {
                        document_id: id.clone(),
                    })
                } else {
                    let row = found_documents
                        .iter()
                        .find(|r| r.document_id == *id)
                        .unwrap();

                    DocumentPreviewV2::Found(row.clone())
                }
            })
            .collect();

        Ok(result)
    }
}
