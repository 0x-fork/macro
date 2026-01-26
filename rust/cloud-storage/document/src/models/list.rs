//! Document list types.

use chrono::{DateTime, Utc};
use models_permissions::share_permission::access_level::AccessLevel;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A document item in a list response.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, JsonSchema)]
pub struct DocumentListItem {
    /// The document id
    pub document_id: String,
    /// The document name
    pub document_name: String,
    /// The owner of the document
    pub owner: String,
    /// The file type of the document
    pub file_type: Option<String>,
    /// The project id containing the document
    pub project_id: Option<String>,
    /// When the document was created
    pub created_at: DateTime<Utc>,
    /// When the document was last updated
    pub updated_at: DateTime<Utc>,
    /// When the document was deleted (null if not deleted)
    pub deleted_at: Option<DateTime<Utc>>,
    /// The user's access level to this document
    pub access_level: AccessLevel,
}

/// Filters for document list queries.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentListFilters {
    /// File types to filter by (e.g., ["pdf", "docx"])
    pub file_types: Option<Vec<String>>,
}

/// Response for listing documents with access.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListDocumentsWithAccessResponse {
    /// The documents the user has access to
    pub documents: Vec<DocumentListItem>,
    /// The number of results returned
    pub results_returned: usize,
}
