//! Port definitions (traits) for document operations.
//!
//! These traits define the boundaries between the domain logic and external
//! infrastructure like databases, storage systems, and HTTP handlers.

use super::models::{DocumentText, GetDocumentOutput, Result};
use macro_user_id::user_id::MacroUserIdStr;
use model::document::{
    DocumentBasic, DocumentMetadata, DocumentPreviewV2, response::GetDocumentListResult,
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
    fn get_document(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<GetDocumentOutput>> + Send;

    /// Retrieves the extracted text content of a document.
    fn get_document_text(
        &self,
        document_id: &str,
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<DocumentText>> + Send;

    /// Retrieves all documents accessible to a user.
    fn get_document_list(
        &self,
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<GetDocumentListResult>>> + Send;

    /// Retrieves preview information for multiple documents.
    ///
    /// Returns preview data for documents the user can access,
    /// and appropriate status for documents that don't exist or aren't accessible.
    fn get_batch_previews(
        &self,
        document_ids: &[String],
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<DocumentPreviewV2>>> + Send;
}

/// Repository trait for document storage operations.
///
/// This trait abstracts the underlying storage mechanism for documents,
/// allowing for different implementations (e.g., PostgreSQL, mock for testing).
#[cfg_attr(test, mockall::automock(type Err = anyhow::Error;))]
pub trait DocumentRepo: Send + Sync + 'static {
    /// Retrieves full document metadata by document ID.
    fn get_document_metadata(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<DocumentMetadata>> + Send;

    /// Retrieves basic document information by document ID.
    fn get_document_basic(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<DocumentBasic>> + Send;

    /// Retrieves the extracted text content of a document.
    ///
    fn get_document_text(&self, document_id: &str) -> impl Future<Output = Result<String>> + Send;

    /// Retrieves all documents for a given user (for search indexing).
    fn get_document_list(
        &self,
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<GetDocumentListResult>>> + Send;

    /// Retrieves preview information for multiple documents.
    fn get_batch_document_previews(
        &self,
        document_ids: &[String],
    ) -> impl Future<Output = Result<Vec<DocumentPreviewV2>>> + Send;

    /// Retrieves the user's last view location within a document.
    fn get_user_view_location(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<Option<String>>> + Send;
}
