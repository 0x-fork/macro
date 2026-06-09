//! Domain models for the Google Drive integration.

mod drive;
mod error;
mod import;
mod link;

pub use drive::{
    DriveFile, DriveFileList, FOLDER_MIME_TYPE, GOOGLE_APPS_MIME_PREFIX, export_target_for,
    is_google_apps_doc,
};
pub use error::GoogleDriveError;
pub use import::{
    ImportFileArgs, ImportItem, ImportRequest, ImportResult, ImportedEntity, ImportedKind,
};
pub use link::GoogleDriveLink;

/// The `foreign_entity.foreign_entity_source` value used to tag entities that
/// originated from Google Drive. Stored alongside the Drive file/folder id so
/// we can later de-duplicate imports and link back to the source.
pub const GOOGLE_DRIVE_FOREIGN_ENTITY_SOURCE: &str = "google_drive";

/// The FusionAuth identity-provider name for the Google Drive OAuth link.
///
/// Mirrors `google_gmail`; the identity provider itself is provisioned in
/// `infra/stacks/fusionauth-instance`.
pub const GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME: &str = "google_drive";
