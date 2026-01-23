//! Domain models for document operations.

use model::document::DocumentMetadata;
use models_permissions::share_permission::access_level::AccessLevel;
use thiserror::Error;

/// Output of the get_document service operation.
#[derive(Debug, Clone)]
pub struct GetDocumentOutput {
    /// The document's metadata.
    pub document_metadata: DocumentMetadata,
    /// The user's access level for this document.
    pub user_access_level: AccessLevel,
    /// The user's last view location within the document, if any.
    pub view_location: Option<String>,
}

/// Distinguish between extracted plaintext and lexical json repr
#[derive(Clone)]
pub enum DocumentText {
    /// A human readable string extracted from a pdf | docx
    PlainText(String),
    /// Json representation of a MD doc
    LexicalJson(String),
}

impl std::fmt::Debug for DocumentText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LexicalJson(json) => write!(f, "LexicalJson({} bytes)", json.bytes().len()),
            Self::PlainText(text) => write!(f, "PlainText({} chars)", text.len()),
        }
    }
}

/// Error type for document service operations.
#[derive(Debug, Error)]
pub enum DocumentServiceErr {
    /// The requested document was not found.
    #[error("document not found")]
    NotFound,

    /// A database or storage error occurred.
    #[error("storage error: {0}")]
    StorageErr(#[from] anyhow::Error),
}

/// Result
pub type Result<T> = std::result::Result<T, DocumentServiceErr>;
