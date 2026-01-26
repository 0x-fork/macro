//! Document models moved from the model crate.
//!
//! This module contains all the document-related types that were previously
//! in the model crate's document module.

#[cfg(test)]
mod test;

mod basic;
mod document_family;
pub mod document_key;
mod docx;
mod file_type;
pub mod list;
pub mod response;

pub use basic::*;
pub use document_family::*;
pub use document_key::*;
pub use docx::*;
pub use file_type::*;
pub use list::*;

use chrono::serde::ts_seconds_option;
use document_sub_type::DocumentSubType;
use macro_user_id::user_id::MacroUserIdStr;
use models_permissions::share_permission::access_level::AccessLevel;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Token for document permissions.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct DocumentPermissionsToken {
    /// The users id if present
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// The document id
    pub document_id: String,
    /// The access level of the user for the document
    pub access_level: AccessLevel,
    /// The expiration time of the token
    pub exp: usize,
    /// The issuer of the token
    pub iss: String,
}

/// Sub type of a document with associated properties encoded in each variant.
/// This ensures type-safety: task properties only exist when the document is a task.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BasicDocumentSubType {
    /// A task document with its associated properties
    Task {
        /// Whether the task is completed.
        /// True if the Status property is set to "Completed".
        is_completed: bool,
    },
}

impl BasicDocumentSubType {
    /// Converts from DB representation (separate sub_type and is_completed columns)
    /// to the domain enum.
    pub fn from_db(sub_type: Option<DocumentSubType>, is_completed: Option<bool>) -> Option<Self> {
        match sub_type? {
            DocumentSubType::Task => Some(Self::Task {
                is_completed: is_completed.unwrap_or_default(),
            }),
        }
    }
}

/// A document with all basic fields.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BasicDocument {
    /// The document id
    #[serde(rename = "id", alias = "documentId")]
    pub document_id: String,
    /// The version of the document
    /// This could be the document_instance_id or document_bom_id depending on
    /// the file type
    pub document_version_id: i64,
    /// The owner of the document
    #[schema(value_type = String)]
    #[sqlx(try_from = "String")]
    pub owner: MacroUserIdStr<'static>,
    /// The name of the document
    #[serde(rename = "name", alias = "documentName")]
    pub document_name: String,
    /// The file type of the document (e.g. pdf, docx)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// If the document is a PDF, this is the SHA of the pdf
    /// If the document is a DOCX, this will not be present
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    /// The id of the project that this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// The id of the document this document branched from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_id: Option<String>,
    /// The id of the version this document branched from
    /// This could be either DocumentInstance or DocumentBom id depending on
    /// the file type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_version_id: Option<i64>,
    /// The id of the document family this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_family_id: Option<i64>,
    /// The time the document was created
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=false)]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the document instance / document BOM was updated
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=false)]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,

    /// The time the document was deleted
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=true)]
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,

    /// The sub type of the document if present.
    /// Task-related properties are encoded within the variant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_type: Option<BasicDocumentSubType>,
}

/// Document information used for backfilling.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct BackfillDocumentInformation {
    /// The document id
    pub document_id: String,
    /// The version of the document
    /// This could be the document_instance_id or document_bom_id depending on
    /// the file type
    pub document_version_id: i64,
    /// The owner of the document
    pub owner: String,
    /// The name of the document
    pub document_name: String,
    /// The file type of the document (file extension)
    pub file_type: String,
    /// If the document is a DOCX document and unzipped, the document_bom will be present
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_bom: Option<serde_json::Value>,
}

/// Document information for search backfilling.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct BackfillSearchDocumentInformation {
    /// The document id
    pub document_id: String,
    /// The document version id
    pub document_version_id: i64,
    /// The owner of the document
    pub owner: String,
    /// The file type of the document
    pub file_type: FileType,
}

/// Full document metadata.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    /// The document id
    pub document_id: String,
    /// The version of the document
    /// This could be the document_instance_id or document_bom_id depending on
    /// the file type
    pub document_version_id: i64,
    /// The owner of the document
    #[schema(value_type = String)]
    #[sqlx(try_from = "String")]
    pub owner: MacroUserIdStr<'static>,
    /// The name of the document
    pub document_name: String,
    /// The file type of the document (file extension)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// If the document is a PDF, this is the SHA of the pdf
    /// If the document is a DOCX, this will not be present
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    /// The id of the project that this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// The name of the project that this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    /// The id of the document this document branched from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_id: Option<String>,
    /// The id of the version this document branched from
    /// This could be either DocumentInstance or DocumentBom id depending on
    /// the file type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_version_id: Option<i64>,
    /// The id of the document family this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_family_id: Option<i64>,
    /// If the document is a DOCX document and unzipped, the document_bom will be present
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Vec<BomPart>, nullable=true)]
    pub document_bom: Option<serde_json::Value>,
    /// The modification data for the document instance.
    /// This is only used for PDF documents.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modification_data: Option<serde_json::Value>,
    /// The time the document was created
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=false)]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the document instance / document BOM was updated
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=false)]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,

    /// The sub type of the document if present.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_type: Option<DocumentSubType>,
}

impl DocumentMetadata {
    /// Creates new DOCX document metadata.
    #[expect(
        clippy::too_many_arguments,
        reason = "no good reason but too hard to fix right now"
    )]
    pub fn new_docx(
        document_id: &str,
        document_bom_id: i64,
        owner: MacroUserIdStr<'static>,
        document_name: &str,
        file_type: &str,
        document_family_id: Option<i64>,
        branched_from_id: Option<String>,
        branched_from_version_id: Option<i64>,
        project_id: Option<String>,
        project_name: Option<String>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Self {
        Self {
            document_id: document_id.to_string(),
            owner,
            document_name: document_name.to_string(),
            file_type: Some(file_type.to_string()),
            sha: None,
            document_version_id: document_bom_id,
            document_bom: Some(serde_json::json!([])),
            modification_data: None,
            document_family_id,
            branched_from_id,
            branched_from_version_id,
            project_id,
            project_name,
            created_at,
            updated_at,
            sub_type: None,
        }
    }

    /// Creates a new document metadata
    #[expect(
        clippy::too_many_arguments,
        reason = "no good reason but too hard to fix right now"
    )]
    pub fn new_document(
        document_id: &str,
        document_instance_id: i64,
        owner: MacroUserIdStr<'static>,
        document_name: &str,
        file_type: Option<FileType>,
        sha: &str,
        document_family_id: Option<i64>,
        branched_from_id: Option<&str>,
        branched_from_version_id: Option<i64>,
        project_id: Option<&str>,
        project_name: Option<&str>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
        sub_type: Option<DocumentSubType>,
    ) -> Self {
        Self {
            document_id: document_id.to_string(),
            owner,
            document_name: document_name.to_string(),
            file_type: file_type.map(|s| s.as_str().to_string()),
            sha: Some(sha.to_string()),
            document_version_id: document_instance_id,
            document_bom: None,
            modification_data: None,
            document_family_id,
            branched_from_id: branched_from_id.map(|s| s.to_string()),
            branched_from_version_id,
            project_id: project_id.map(|s| s.to_string()),
            project_name: project_name.map(|s| s.to_string()),
            created_at,
            updated_at,
            sub_type,
        }
    }

    /// Creates document metadata with all fields specified.
    #[expect(
        clippy::too_many_arguments,
        reason = "no good reason but too hard to fix right now"
    )]
    pub fn document(
        document_id: &str,
        document_instance_id: i64,
        owner: MacroUserIdStr<'static>,
        document_name: &str,
        file_type: Option<&str>,
        sha: &str,
        modification_data: Option<serde_json::Value>,
        document_family_id: Option<i64>,
        branched_from_id: Option<String>,
        branched_from_version_id: Option<i64>,
        project_id: Option<String>,
        project_name: Option<String>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
        sub_type: Option<DocumentSubType>,
    ) -> Self {
        Self {
            document_id: document_id.to_string(),
            owner,
            document_name: document_name.to_string(),
            file_type: file_type.map(|s| s.to_string()),
            sha: Some(sha.to_string()),
            document_version_id: document_instance_id,
            document_bom: None,
            modification_data,
            document_family_id,
            branched_from_id,
            branched_from_version_id,
            project_id,
            project_name,
            created_at,
            updated_at,
            sub_type,
        }
    }
}

/// Document preview types.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocumentPreview {
    /// User has access to this document
    Access(DocumentPreviewData),
    /// User does not have access to this document
    NoAccess(WithDocumentId),
    /// Document does not exist
    DoesNotExist(WithDocumentId),
}

/// The sub type of a document preview with associated properties.
/// Task-related properties are encoded within the variant to ensure valid states.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocumentPreviewDataSubType {
    /// A task document with completion status
    Task {
        /// Whether the task is completed.
        /// True if the Status property is set to "Completed".
        is_completed: bool,
    },
}

impl DocumentPreviewDataSubType {
    /// Converts from DB representation (separate sub_type and is_completed columns)
    /// to the domain enum.
    pub fn from_db(sub_type: Option<DocumentSubType>, is_completed: Option<bool>) -> Option<Self> {
        match sub_type? {
            DocumentSubType::Task => Some(Self::Task {
                is_completed: is_completed.unwrap_or_default(),
            }),
        }
    }
}

/// Document preview data.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
pub struct DocumentPreviewData {
    /// The document id
    pub document_id: String,
    /// The file type of the document (e.g. pdf, docx)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// The name of the document
    pub document_name: String,
    /// The id of the owner of the document
    pub owner: String,
    /// The time the document was last updated
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=false)]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The sub type of the document if present.
    /// Task-related properties are encoded within the variant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_type: Option<DocumentPreviewDataSubType>,
}

/// Simple struct containing just a document id.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
pub struct WithDocumentId {
    /// The document id
    pub document_id: String,
}

/// V2 document preview enum.
#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocumentPreviewV2 {
    /// Document was found
    Found(DocumentPreviewData),
    /// Document does not exist
    DoesNotExist(WithDocumentId),
}
