//! Basic document types.

use std::str::FromStr;

use super::file_type::FileType;
use crate::models::FileTypeExt;
use chrono::serde::ts_seconds_option;
use macro_user_id::user_id::MacroUserIdStr;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A document with basic fields.
#[derive(sqlx::FromRow, Serialize, Deserialize, Eq, PartialEq, Debug)]
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
    #[serde(with = "ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the document was last updated
    #[serde(with = "ts_seconds_option")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrieve just an ID from db.
#[derive(sqlx::FromRow, Serialize, Deserialize, Debug, Hash, PartialEq, Eq, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ID {
    /// The id
    pub id: String,
}

/// Simple struct to retrieve an ID with created/updated timestamps from db.
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct IDWithTimeStamps {
    /// The id
    pub id: String,
    /// The time the entity was created
    #[serde(with = "ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the entity was last updated
    #[serde(with = "ts_seconds_option")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Simple struct to retrieve just a version ID from db.
#[derive(sqlx::FromRow, Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct VersionID {
    /// The version id
    pub id: i64,
}

/// Version ID with timestamps and optional sha.
#[derive(Serialize, Deserialize, Debug, sqlx::FromRow)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStampsOptionalSha {
    /// The version id
    pub id: i64,
    /// The sha (optional)
    pub sha: Option<String>,
    /// The time the entity was created
    #[serde(with = "ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the entity was last updated
    #[serde(with = "ts_seconds_option")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Version ID with timestamps but no sha.
#[derive(Serialize, Deserialize, Debug, sqlx::FromRow)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStampsNoSha {
    /// The version id
    pub id: i64,
    /// The time the entity was created
    #[serde(with = "ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the entity was last updated
    #[serde(with = "ts_seconds_option")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Version ID with timestamps and sha.
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct VersionIDWithTimeStamps {
    /// The version id
    pub id: i64,
    /// The sha
    pub sha: String,
    /// The time the entity was created
    #[serde(with = "ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The time the entity was last updated
    #[serde(with = "ts_seconds_option")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Returns basic information of a document used for some db queries.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentBasic {
    /// The document id
    pub document_id: String,
    /// The document name
    pub document_name: String,
    /// The owner of the document
    #[schema(value_type = String)]
    pub owner: MacroUserIdStr<'static>,
    /// The file type of the document
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// The id of the document this document branched from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_id: Option<String>,
    /// The id of the version this document branched from
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branched_from_version_id: Option<i64>,
    /// The id of the document family this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_family_id: Option<i64>,
    /// The id of the project this document belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// The time the document was deleted
    #[serde(with = "ts_seconds_option")]
    #[schema(value_type = i64, nullable=true)]
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Returns basic information of a document used for document context.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct DocumentInfo {
    /// The document id
    pub document_id: String,
    /// The document owner
    pub document_owner: String,
    /// The file type
    pub file_type: String,
}

impl DocumentBasic {
    /// Returns true if this document's file type contains readable text content.
    pub fn is_text_content(&self) -> bool {
        self.file_type
            .as_deref()
            .map(FileType::from_str)
            .and_then(Result::ok)
            .map(|ft| ft.is_text_content())
            .unwrap_or(false)
    }

    /// Attempts to parse and return the file type.
    pub fn try_file_type(&self) -> Option<FileType> {
        self.file_type
            .as_deref()
            .map(FileType::from_str)
            .and_then(Result::ok)
    }
}
