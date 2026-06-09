//! Models mirroring the Google Drive REST API v3 `files` resource.

use serde::{Deserialize, Serialize};

/// MIME type Google Drive uses to represent a folder.
pub const FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";

/// Prefix shared by all Google-native document MIME types (Docs, Sheets,
/// Slides, …). These cannot be downloaded directly and must be exported to a
/// concrete format via `files.export`.
pub const GOOGLE_APPS_MIME_PREFIX: &str = "application/vnd.google-apps.";

/// A single Google Drive file or folder.
///
/// Only the fields we request (and care about) are modelled. The Drive API
/// returns `camelCase`; `size` is a stringified integer and is absent for
/// folders and Google-native docs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    /// The Drive file id (stable, opaque).
    pub id: String,
    /// Human-readable name (no path).
    pub name: String,
    /// The Drive MIME type. Folders use [`FOLDER_MIME_TYPE`].
    pub mime_type: String,
    /// Parent folder ids. The Drive root has no parents.
    #[serde(default)]
    pub parents: Vec<String>,
    /// Size in bytes, when known. Absent for folders / Google-native docs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    /// Last-modified timestamp (RFC 3339).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_time: Option<String>,
    /// A link that opens the file in the Drive web UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_view_link: Option<String>,
    /// Whether the file lives in the owner's trash.
    #[serde(default)]
    pub trashed: bool,
}

impl DriveFile {
    /// Whether this entry is a folder.
    pub fn is_folder(&self) -> bool {
        self.mime_type == FOLDER_MIME_TYPE
    }

    /// Whether this entry is a Google-native document (Docs/Sheets/Slides/…)
    /// that must be exported rather than downloaded directly.
    pub fn is_google_apps_doc(&self) -> bool {
        is_google_apps_doc(&self.mime_type)
    }

    /// Size in bytes if the Drive API reported a parseable value.
    pub fn size_bytes(&self) -> Option<u64> {
        self.size.as_deref().and_then(|s| s.parse().ok())
    }
}

/// A page of [`DriveFile`]s returned by `files.list`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct DriveFileList {
    /// The files in this page.
    #[serde(default)]
    pub files: Vec<DriveFile>,
    /// Opaque cursor for the next page, when more results exist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

/// Whether a Drive MIME type denotes a Google-native document.
pub fn is_google_apps_doc(mime_type: &str) -> bool {
    mime_type.starts_with(GOOGLE_APPS_MIME_PREFIX) && mime_type != FOLDER_MIME_TYPE
}

/// The format we export a Google-native document to when importing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExportTarget {
    /// The `mimeType` to pass to `files.export`.
    pub export_mime: &'static str,
    /// The file extension Macro should store the exported content under.
    pub extension: &'static str,
}

const MIME_PDF: &str = "application/pdf";

/// Pick an export format for a Google-native MIME type.
///
/// Returns `None` for non-Google-native files (which are downloaded as-is) and
/// for folders. Google-native docs (Docs/Sheets/Slides/Drawings) are exported
/// to **PDF**: PDF is a first-class static type in Macro that lands directly in
/// object storage and is immediately viewable, so it needs no conversion
/// pipeline. (Exporting to editable Office formats — docx/xlsx/pptx — is a
/// natural follow-up.)
pub fn export_target_for(mime_type: &str) -> Option<ExportTarget> {
    if !is_google_apps_doc(mime_type) {
        return None;
    }
    Some(ExportTarget {
        export_mime: MIME_PDF,
        extension: "pdf",
    })
}
