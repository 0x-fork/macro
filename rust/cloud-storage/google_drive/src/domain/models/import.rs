//! Request/response models for importing Drive content into Macro.

use serde::{Deserialize, Serialize};

/// A request to import a set of Drive files/folders into Macro.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    /// The Drive files/folders the user selected to import. Folders are
    /// imported recursively.
    pub items: Vec<ImportItem>,
    /// Optional Macro project (folder) to import into. `None` imports into the
    /// user's root.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination_project_id: Option<String>,
}

/// A single selected Drive node. Only the id is needed; the service fetches
/// authoritative metadata from Drive rather than trusting the client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    /// The Drive file/folder id to import.
    pub drive_id: String,
}

/// The kind of Macro entity produced by an import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum ImportedKind {
    /// A Macro Project (folder).
    Folder,
    /// A Macro Document (file).
    Document,
}

/// A single entity produced by an import, mapping a Drive id to its new Macro id.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ImportedEntity {
    /// The originating Drive file/folder id.
    pub drive_id: String,
    /// The id of the created Macro Project or Document.
    pub macro_id: String,
    /// Whether a folder or document was created.
    pub kind: ImportedKind,
    /// The name of the created entity.
    pub name: String,
}

/// Summary of an import run.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// The entities successfully created in Macro.
    pub imported: Vec<ImportedEntity>,
    /// Number of Drive items skipped (trashed, unsupported, or already imported).
    pub skipped: u32,
}

impl ImportResult {
    /// Record a successfully imported entity.
    pub fn push(&mut self, entity: ImportedEntity) {
        self.imported.push(entity);
    }

    /// Record a skipped Drive item.
    pub fn skip(&mut self) {
        self.skipped += 1;
    }
}

/// Everything the storage sink needs to materialize one Drive file as a Macro
/// Document. Internal (service → sink); never crosses the API boundary.
#[derive(Debug, Clone)]
pub struct ImportFileArgs {
    /// The originating Drive file id (recorded as a foreign entity).
    pub drive_id: String,
    /// The file name **including** the extension it should be stored under
    /// (already adjusted for exported Google-native docs, e.g. `Notes.docx`).
    pub name: String,
    /// The original Drive MIME type, stored in foreign-entity metadata.
    pub mime_type: String,
    /// A link back to the file in Drive, when available.
    pub web_view_link: Option<String>,
    /// The Macro Project this document should be created in, if any.
    pub parent_macro_project_id: Option<String>,
    /// The downloaded (or exported) file content.
    pub content: Vec<u8>,
}
