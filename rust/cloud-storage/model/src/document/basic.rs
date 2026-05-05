use std::str::FromStr;

use super::file_type::FileType;
use crate::document::FileTypeExt;
use macro_user_id::user_id::MacroUserIdStr;
use utoipa::ToSchema;

/// Metadata DSS keeps about a markdown document's sync-service state.
///
/// The sync service remains the source of truth for collaboration. These fields are a DSS-side
/// cache/pointer used to avoid hot-path `/exists` checks and to locate the latest mirrored Loro
/// snapshot in the document storage bucket.
#[derive(
    serde::Serialize,
    serde::Deserialize,
    Eq,
    PartialEq,
    Debug,
    Clone,
    ToSchema,
    schemars::JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSyncServiceState {
    /// When DSS first learned that this document was initialized in sync-service.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initialized_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The sync-service/Loro frontier string for the mirrored snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    /// S3 object key for the latest mirrored Loro snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_key: Option<String>,
    /// Hex SHA-256 of the latest mirrored Loro snapshot bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_sha256: Option<String>,
    /// Size in bytes of the latest mirrored Loro snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_size_bytes: Option<i64>,
    /// Timestamp supplied by sync-service for the latest mirrored snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl DocumentSyncServiceState {
    /// Returns true when DSS can treat the document as initialized in sync-service.
    pub fn is_initialized(&self) -> bool {
        self.initialized_at.is_some()
    }
}

#[derive(sqlx::FromRow, serde::Serialize, serde::Deserialize, Eq, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub struct Document {
    /// The document uuid
    pub id: String,
    /// The owner of the document
    pub owner: String,
    /// The name of the document
    pub name: String,
    /// The file type
    pub file_type: String,
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
    /// The id of the project this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// The time the document was created
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the document was last updated
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrvieve just an ID from db
#[derive(
    sqlx::FromRow, serde::Serialize, serde::Deserialize, Debug, Hash, PartialEq, Eq, Clone,
)]
#[serde(rename_all = "snake_case")]
pub struct ID {
    pub id: String,
}

/// Simple struct to retrvieve an ID with created/updated timestamps from db
#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct IDWithTimeStamps {
    pub id: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrvieve just an ID from db
#[derive(sqlx::FromRow, serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct VersionID {
    pub id: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, sqlx::FromRow)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStampsOptionalSha {
    pub id: i64,
    pub sha: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrvieve an ID with created/updated timestamps from db
#[derive(serde::Serialize, serde::Deserialize, Debug, sqlx::FromRow)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStampsNoSha {
    pub id: i64,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrvieve an ID with created/updated timestamps from db
#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStamps {
    pub id: i64,
    pub sha: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Returns basic information of a document used for some db queries
#[derive(serde::Serialize, serde::Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentBasic {
    pub document_id: String,
    pub document_name: String,
    #[schema(value_type = String)]
    pub owner: MacroUserIdStr<'static>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_version_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_family_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sync_service: Option<DocumentSyncServiceState>,
}

/// Returns basic information of a document used for document context
#[derive(serde::Serialize, serde::Deserialize, Eq, PartialEq, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct DocumentInfo {
    pub document_id: String,
    pub document_owner: String,
    pub file_type: String,
}

impl DocumentBasic {
    pub fn is_text_content(&self) -> bool {
        self.file_type
            .as_deref()
            .map(FileType::from_str)
            .and_then(Result::ok)
            .map(|ft| ft.is_text_content())
            .unwrap_or(false)
    }
    pub fn try_file_type(&self) -> Option<FileType> {
        self.file_type
            .as_deref()
            .map(FileType::from_str)
            .and_then(Result::ok)
    }

    pub fn is_sync_service_initialized(&self) -> bool {
        self.sync_service
            .as_ref()
            .is_some_and(DocumentSyncServiceState::is_initialized)
    }
}
