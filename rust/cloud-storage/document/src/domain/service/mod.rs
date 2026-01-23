//! Document service implementation.
//!
//! This module contains the core business logic for document operations,
//! including authorization checks before accessing document data.

#[cfg(test)]
mod test;

use super::{
    models::{DocumentServiceErr, DocumentText, GetDocumentOutput, Result},
    ports::{DocumentMetadataRepo, DocumentService, DocumentStorageRepo},
};
use entity_access::domain::{models::EntityType, ports::EntityAccessService};
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};
use model::document::{
    DocumentBasic, DocumentPreviewV2, FileType, response::GetDocumentListResult,
};
use models_permissions::share_permission::access_level::AccessLevel;
use std::{str::FromStr, sync::Arc};

/// Implementation of the document service.
///
/// This service orchestrates document operations by:
/// 1. Checking authorization using the entity access service
/// 2. Delegating to metadata and storage repositories for data access
pub struct DocumentServiceImpl<EntityAccess, Storage, Metadata>
where
    EntityAccess: EntityAccessService,
    Storage: DocumentStorageRepo,
    Metadata: DocumentMetadataRepo,
{
    entity_access: Arc<EntityAccess>,
    storage: Arc<Storage>,
    metadata: Arc<Metadata>,
}

impl<EntityAccess, Storage, Metadata> DocumentServiceImpl<EntityAccess, Storage, Metadata>
where
    EntityAccess: EntityAccessService,
    Storage: DocumentStorageRepo,
    Metadata: DocumentMetadataRepo,
{
    /// Creates a new document service.
    pub fn new(
        entity_access: Arc<EntityAccess>,
        storage: Arc<Storage>,
        metadata: Arc<Metadata>,
    ) -> Self {
        Self {
            entity_access,
            storage,
            metadata,
        }
    }

    /// Check authorization for a document.
    ///
    /// Returns the user's access level if authorized.
    /// Logic mirrors DocumentAccessExtractor:
    /// 1. If user is owner → Owner access
    /// 2. If document is deleted and user is not owner → Unauthorized
    /// 3. Otherwise, check access level via entity_access service
    #[tracing::instrument(skip(self), err)]
    async fn check_document_access(
        &self,
        document: &DocumentBasic,
        user_id: MacroUserIdStr<'_>,
        required_level: AccessLevel,
    ) -> Result<AccessLevel> {
        // Owner always has full access
        if document.owner == user_id {
            return Ok(AccessLevel::Owner);
        }

        // Only owners can access deleted documents
        if document.deleted_at.is_some() {
            return Err(DocumentServiceErr::UnauthorizedWithMsg(
                "only owner can access deleted resource",
            ));
        }

        // Check access level via entity_access service
        let access_level = self
            .entity_access
            .get_access_level(&user_id.0, &document.document_id, EntityType::Document)
            .await
            .map_err(|e| DocumentServiceErr::StorageErr(e.into()))?;

        match access_level {
            Some(level) if level >= required_level => Ok(level),
            _ => Err(DocumentServiceErr::Unauthorized),
        }
    }
}

impl<EntityAccess, Storage, Metadata> DocumentService
    for DocumentServiceImpl<EntityAccess, Storage, Metadata>
where
    EntityAccess: EntityAccessService,
    Storage: DocumentStorageRepo,
    Metadata: DocumentMetadataRepo,
{
    #[tracing::instrument(skip(self), err)]
    async fn get_document(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'_>,
    ) -> Result<GetDocumentOutput> {
        // Get document basic info for authorization check
        let document_basic = self.metadata.get_document_basic(document_id).await?;

        // Check authorization (requires View access)
        let access_level = self
            .check_document_access(&document_basic, user_id.copied(), AccessLevel::View)
            .await?;

        // Get full metadata
        let document_metadata = self
            .metadata
            .get_document_metadata(document_id, user_id.copied())
            .await?;

        // Get view location
        let view_location = self
            .metadata
            .get_user_view_location(document_id, user_id)
            .await?;

        Ok(GetDocumentOutput {
            document_metadata,
            user_access_level: access_level,
            view_location,
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_text(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'_>,
    ) -> Result<DocumentText> {
        // Get document basic info for authorization check
        let document_basic = self.metadata.get_document_basic(document_id).await?;

        // Check authorization (requires View access)
        self.check_document_access(&document_basic, user_id.copied(), AccessLevel::View)
            .await?;

        // Determine if this is a markdown file (sync service) or extracted text
        let file_type = document_basic
            .file_type
            .as_deref()
            .and_then(|f| FileType::from_str(f).ok());

        if matches!(file_type, Some(FileType::Md)) {
            // Markdown files: get from sync service
            let text = self.storage.get_md_text(document_id).await?;
            Ok(DocumentText::LexicalJson(text))
        } else {
            // Other files: get extracted text from database
            let text = self
                .metadata
                .get_extracted_text(user_id, document_id)
                .await?
                .ok_or(DocumentServiceErr::NotFound)?;
            Ok(DocumentText::PlainText(text))
        }
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_document_list(
        &self,
        user_id: MacroUserIdStr<'_>,
    ) -> Result<Vec<GetDocumentListResult>> {
        // No per-document authorization needed - returns only user's own documents
        self.metadata.get_document_list(user_id).await
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_batch_previews(
        &self,
        document_ids: &[String],
        _user_id: MacroUserIdStr<'_>,
    ) -> Result<Vec<DocumentPreviewV2>> {
        // Note: The existing API does not perform per-document authorization checks
        // for batch previews. It returns preview data for all requested documents
        // that exist, regardless of access level. This mirrors that behavior.
        self.metadata
            .get_batch_document_previews(document_ids)
            .await
    }
}
