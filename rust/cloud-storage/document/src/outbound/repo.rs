//! PostgreSQL + S3 + SyncService implementation of the DocumentRepo trait.

use std::collections::HashSet;
use std::sync::Arc;

use document_sub_type::DocumentSubType;
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};
use model::document::{
    DocumentBasic, DocumentMetadata, DocumentPreviewData, DocumentPreviewDataSubType,
    DocumentPreviewV2, WithDocumentId, response::GetDocumentListResult,
};
use s3_client::S3;
use sqlx::{Pool, Postgres};
use sync_service_client::SyncServiceClient;
use system_properties::{StatusOption, SystemPropertyKey};

use crate::domain::ports::DocumentRepo;

/// Repository implementation backed by PostgreSQL, S3, and SyncService.
/// This structure is a reflection of the current state of document storage
/// MacroDB is a PostgresDb
/// Document metadata is stored in macrodb
/// Document text is stored in macrodb (except MD files)
/// Document content is stored in s3 (except MD files)
/// Md files are stored as json in SyncService
#[derive(Clone)]
pub struct S3PgSyncServiceRepo {
    db: Arc<Pool<Postgres>>,
    s3: Arc<S3>,
    sync_service: Arc<SyncServiceClient>,
}

impl S3PgSyncServiceRepo {
    /// Creates a new repository instance.
    pub fn new(db: Arc<Pool<Postgres>>, s3: Arc<S3>, sync_service: Arc<SyncServiceClient>) -> Self {
        Self {
            db,
            s3,
            sync_service,
        }
    }
}
