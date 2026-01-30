//! Storage adapter for document content retrieval.
//!
//! This module provides access to document content stored in S3/CloudFront
//! and markdown content from the sync service.

use crate::domain::{
    models::{DocumentServiceErr, Result},
    ports::{DocumentStorageRepo, GetLocationRequest},
};
use crate::models::{
    CONVERTED_DOCUMENT_FILE_NAME, FileType, FileTypeExt, build_cloud_storage_bucket_document_key,
    response::{LocationResponseV3, PresignedUrl},
};
use anyhow::anyhow;
use cloudfront_sign::{SignedOptions, get_signed_url};
use rayon::prelude::*;
use sqlx::{FromRow, PgPool};
use std::{
    str::FromStr,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use sync_service_client::SyncServiceClient;

// Database query result types - defined here to avoid dependency on macro_db_client
#[derive(FromRow)]
struct DocumentVersionResult {
    id: i64,
    #[allow(dead_code)]
    uploaded: bool,
}

#[derive(FromRow)]
struct DocumentVersionIdResult {
    id: i64,
    #[allow(dead_code)]
    uploaded: bool,
}

/// Configuration for CloudFront URL signing.
#[derive(Debug, Clone)]
pub struct CloudFrontConfig {
    /// The CloudFront public key ID for signing.
    pub public_key_id: String,
    /// The CloudFront private key (PEM format) for signing.
    pub private_key: String,
    /// The CloudFront distribution URL.
    pub distribution_url: String,
    /// How long presigned URLs are valid (in seconds).
    pub presigned_url_expiry_seconds: u64,
}

/// Storage repository for document content access.
pub struct StorageRepo {
    sync_service: Arc<SyncServiceClient>,
    db: Arc<PgPool>,
    config: CloudFrontConfig,
}

impl StorageRepo {
    /// Creates a new StorageRepo.
    pub fn new(
        sync_service: Arc<SyncServiceClient>,
        db: Arc<PgPool>,
        config: CloudFrontConfig,
    ) -> Self {
        Self {
            sync_service,
            db,
            config,
        }
    }

    fn get_signed_options(&self) -> SignedOptions {
        let current_unix_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let date_less_than = current_unix_timestamp + self.config.presigned_url_expiry_seconds;

        SignedOptions {
            key_pair_id: self.config.public_key_id.clone(),
            date_less_than,
            private_key: self.config.private_key.clone(),
            ..Default::default()
        }
    }

    fn sign_url(&self, key: &str) -> Result<String> {
        let constructed_url = format!("{}/{}", self.config.distribution_url, key);
        let signed_options = self.get_signed_options();
        get_signed_url(&constructed_url, &signed_options)
            .map_err(|e| DocumentServiceErr::StorageErr(e.into()))
    }

    // Database helper methods - inlined to avoid cyclic dependency with macro_db_client

    #[tracing::instrument(skip(self), err)]
    async fn get_latest_document_version_id(&self, document_id: &str) -> anyhow::Result<i64> {
        let row = sqlx::query_as::<_, DocumentVersionResult>(
            r#"
            SELECT
                di.id,
                d.uploaded
            FROM "DocumentInstance" di
            JOIN "Document" d ON di."documentId" = d.id
            WHERE di."documentId" = $1
            ORDER BY di."createdAt" DESC
            LIMIT 1
            "#,
        )
        .bind(document_id)
        .fetch_one(self.db.as_ref())
        .await?;

        Ok(row.id)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_version_id(&self, document_id: &str) -> anyhow::Result<i64> {
        let row = sqlx::query_as::<_, DocumentVersionIdResult>(
            r#"
            SELECT
                COALESCE(db.id, di.id) as "id!",
                d.uploaded
            FROM
                "Document" d
            LEFT JOIN LATERAL (
                SELECT i.id
                FROM "DocumentInstance" i
                WHERE i."documentId" = d.id
                ORDER BY i."createdAt" ASC
                LIMIT 1
            ) di ON d."fileType" IS DISTINCT FROM 'docx'
            LEFT JOIN LATERAL (
                SELECT b.id
                FROM "DocumentBom" b
                WHERE b."documentId" = d.id
                ORDER BY b."updatedAt" DESC
                LIMIT 1
            ) db ON d."fileType" = 'docx'
            WHERE d.id = $1
            "#,
        )
        .bind(document_id)
        .fetch_one(self.db.as_ref())
        .await?;

        Ok(row.id)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_shas(&self, document_version_id: i64) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"
            SELECT bp.sha
            FROM "BomPart" bp
            WHERE bp."documentBomId" = $1
            "#,
        )
        .bind(document_version_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_shas_by_document_id(
        &self,
        document_id: &str,
    ) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"
            SELECT bp.sha
            FROM "BomPart" bp
            JOIN "DocumentBom" db ON bp."documentBomId" = db.id
            WHERE db."documentId" = $1
            AND db.id = (
                SELECT db_inner.id
                FROM "DocumentBom" db_inner
                WHERE db_inner."documentId" = $1
                ORDER BY db_inner."updatedAt" DESC
                LIMIT 1
            )
            "#,
        )
        .bind(document_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_editable_url(
        &self,
        owner: &str,
        document_id: &str,
        document_version_id: Option<i64>,
        file_type: &str,
    ) -> Result<String> {
        let url_encoded_owner = urlencoding::encode(owner);
        let document_version_id = if let Some(vid) = document_version_id {
            vid
        } else {
            self.get_latest_document_version_id(document_id)
                .await
                .map_err(DocumentServiceErr::StorageErr)?
        };

        let document_key = build_cloud_storage_bucket_document_key(
            &url_encoded_owner,
            document_id,
            document_version_id,
            Some(file_type),
        );

        self.sign_url(&document_key)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_static_url(
        &self,
        owner: &str,
        document_id: &str,
        file_type: Option<&str>,
    ) -> Result<String> {
        let url_encoded_owner = urlencoding::encode(owner);
        let document_version_id = self
            .get_document_version_id(document_id)
            .await
            .map_err(DocumentServiceErr::StorageErr)?;

        let document_key = build_cloud_storage_bucket_document_key(
            &url_encoded_owner,
            document_id,
            document_version_id,
            file_type,
        );

        self.sign_url(&document_key)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_converted_docx_url(&self, owner: &str, document_id: &str) -> Result<String> {
        let url_encoded_owner = urlencoding::encode(owner);
        let document_key = format!(
            "{}/{}/{}.pdf",
            url_encoded_owner, document_id, CONVERTED_DOCUMENT_FILE_NAME
        );

        self.sign_url(&document_key)
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_docx_urls(
        &self,
        document_id: &str,
        document_version_id: Option<i64>,
    ) -> Result<Vec<PresignedUrl>> {
        let shas: Vec<String> = if let Some(vid) = document_version_id {
            self.get_document_shas(vid)
                .await
                .map_err(DocumentServiceErr::StorageErr)?
        } else {
            self.get_document_shas_by_document_id(document_id)
                .await
                .map_err(DocumentServiceErr::StorageErr)?
        };

        let signed_options = self.get_signed_options();
        let distribution_url = &self.config.distribution_url;

        let presigned_urls: Vec<PresignedUrl> = shas
            .par_iter()
            .filter_map(|sha| {
                let constructed_url = format!("{}/{}", distribution_url, sha);
                match get_signed_url(&constructed_url, &signed_options) {
                    Ok(url) => Some(PresignedUrl {
                        presigned_url: url,
                        sha: sha.to_string(),
                    }),
                    Err(e) => {
                        tracing::error!(error=?e, sha=?sha, "unable to generate presigned url");
                        None
                    }
                }
            })
            .collect();

        if shas.len() != presigned_urls.len() {
            return Err(DocumentServiceErr::StorageErr(anyhow!(
                "unable to generate presigned urls for all shas"
            )));
        }

        Ok(presigned_urls)
    }
}

impl DocumentStorageRepo for StorageRepo {
    #[tracing::instrument(skip(self), err)]
    async fn get_document_location(
        &self,
        request: GetLocationRequest,
    ) -> Result<LocationResponseV3> {
        let document = request.document;
        let document_id = &document.document_id;
        let owner = document.owner.as_ref();
        let file_type: Option<FileType> = document
            .file_type
            .as_deref()
            .and_then(|f| FileType::from_str(f).ok());

        // Markdown files are stored in sync service
        if matches!(file_type, Some(FileType::Md)) {
            let sync_service_metadata = self
                .sync_service
                .get_metadata(document_id)
                .await
                .map_err(DocumentServiceErr::StorageErr)?;

            return Ok(LocationResponseV3::SyncServiceContent {
                metadata: document,
                sync_service_metadata,
            });
        }

        // Get presigned URL based on file type
        match file_type {
            None => {
                let url = self.get_static_url(owner, document_id, None).await?;
                Ok(LocationResponseV3::PresignedUrl {
                    presigned_url: url,
                    metadata: document,
                })
            }
            Some(ft) => {
                if ft == FileType::Docx && request.get_converted_docx_url {
                    let url = self.get_converted_docx_url(owner, document_id).await?;
                    Ok(LocationResponseV3::PresignedUrl {
                        presigned_url: url,
                        metadata: document,
                    })
                } else if ft == FileType::Docx {
                    let urls = self
                        .get_docx_urls(document_id, request.document_version_id)
                        .await?;
                    Ok(LocationResponseV3::PresignedUrls {
                        presigned_urls: urls,
                        metadata: document,
                    })
                } else if ft.is_static() {
                    let url = self
                        .get_static_url(owner, document_id, Some(ft.as_str()))
                        .await?;
                    Ok(LocationResponseV3::PresignedUrl {
                        presigned_url: url,
                        metadata: document,
                    })
                } else {
                    let url = self
                        .get_editable_url(
                            owner,
                            document_id,
                            request.document_version_id,
                            ft.as_str(),
                        )
                        .await?;
                    Ok(LocationResponseV3::PresignedUrl {
                        presigned_url: url,
                        metadata: document,
                    })
                }
            }
        }
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_md_text(&self, document_id: &str) -> Result<String> {
        self.sync_service
            .get_raw(document_id)
            .await
            .map_err(DocumentServiceErr::StorageErr)
    }
}
