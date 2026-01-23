//! Port definitions (traits) for document operations.
//!
//! These traits define the boundaries between the domain logic and external
//! infrastructure like databases, storage systems, and HTTP handlers.

use super::models::{DocumentText, GetDocumentOutput, Result};
use macro_user_id::user_id::MacroUserIdStr;
use model::document::{
    DocumentBasic, DocumentMetadata, DocumentPreviewV2,
    response::{GetDocumentListResult, LocationResponseV3},
};
use std::future::Future;

/// Service trait for document operations.
///
/// This trait defines the high-level operations for working with documents,
/// including authorization-aware fetching of documents and their metadata.
pub trait DocumentService: Send + Sync + 'static {
    /// Retrieves a document with its metadata and the user's access level.
    ///
    /// This method combines document metadata retrieval with authorization
    /// context, returning the user's access level and view location.
    fn get_document<'a>(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<GetDocumentOutput>> + Send;

    /// Retrieves the extracted text content of a document.
    fn get_document_text<'a>(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<DocumentText>> + Send;

    /// Retrieves all documents accessible to a user.
    fn get_document_list<'a>(
        &self,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<Vec<GetDocumentListResult>>> + Send;

    /// Retrieves preview information for multiple documents.
    ///
    /// Returns preview data for documents the user can access,
    /// and appropriate status for documents that don't exist or aren't accessible.
    fn get_batch_previews<'a>(
        &self,
        document_ids: &[String],
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<Vec<DocumentPreviewV2>>> + Send;
}

#[cfg_attr(test, mockall::automock(type Err = anyhow::Error;))]
pub trait DocumentMetadataRepo: Send + Sync + 'static + Sized {
    /// Retrieves full document metadata by document ID.
    fn get_document_metadata<'a>(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<DocumentMetadata>> + Send;

    /// Retrieves basic document information by document ID.
    fn get_document_basic(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<DocumentBasic>> + Send;

    /// Retrieves all documents for a given user (for search indexing).
    fn get_document_list<'a>(
        &self,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<Vec<GetDocumentListResult>>> + Send;

    /// Retrieves the user's last view location within a document.
    fn get_user_view_location<'a>(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'a>,
    ) -> impl Future<Output = Result<Option<String>>> + Send;

    /// Retrieves the extracted text content of a document.
    fn get_extracted_text<'a>(
        &self,
        user_id: MacroUserIdStr<'a>,
        document_id: &str,
    ) -> impl Future<Output = Result<Option<String>>> + Send;

    /// Retrieves preview information for multiple documents.
    fn get_batch_document_previews(
        &self,
        document_ids: &[String],
    ) -> impl Future<Output = Result<Vec<DocumentPreviewV2>>> + Send;
}

/// Request parameters for getting a document's storage location.
#[derive(Debug, Clone)]
pub struct GetLocationRequest {
    /// The document basic metadata (includes id, owner, file_type).
    pub document: DocumentBasic,
    /// Optional specific version ID.
    pub document_version_id: Option<i64>,
    /// If true, return the converted PDF URL for DOCX files.
    pub get_converted_docx_url: bool,
}

#[cfg_attr(test, mockall::automock(type Err = anyhow::Error;))]
pub trait DocumentStorageRepo: Send + Sync + 'static + Sized {
    /// Retrieves presigned URL(s) for accessing document content in storage.
    ///
    /// Returns either a single presigned URL or multiple URLs (for DOCX BOM parts),
    /// along with document metadata and optionally sync service content for markdown files.
    fn get_document_location(
        &self,
        request: GetLocationRequest,
    ) -> impl Future<Output = Result<LocationResponseV3>> + Send;

    /// Retrieves markdown content from the sync service.
    fn get_md_text(&self, document_id: &str) -> impl Future<Output = Result<String>> + Send;
}
