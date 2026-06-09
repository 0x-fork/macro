//! Port definitions (traits) for the Google Drive integration.
//!
//! Adapters live in [`crate::outbound`] (Drive REST client, access-token
//! client, Postgres link repo) and in the calling service for
//! [`DriveImportSink`] (the Macro-storage details).

use std::future::Future;

use uuid::Uuid;

use crate::domain::models::{
    DriveFile, DriveFileList, GoogleDriveError, GoogleDriveLink, ImportFileArgs, ImportRequest,
    ImportResult,
};

/// Read access to the Google Drive REST API v3.
pub trait DriveApi: Send + Sync + 'static {
    /// Error type returned by Drive API calls.
    type Err: Into<anyhow::Error> + Send + std::fmt::Debug;

    /// List the direct children of a folder (`folder_id`, or the special id
    /// `"root"`). Trashed items are excluded. Returns one page; follow
    /// [`DriveFileList::next_page_token`] for the rest.
    fn list_children(
        &self,
        access_token: &str,
        folder_id: &str,
        page_token: Option<&str>,
    ) -> impl Future<Output = Result<DriveFileList, Self::Err>> + Send;

    /// Fetch a single file/folder's metadata.
    fn get_file(
        &self,
        access_token: &str,
        file_id: &str,
    ) -> impl Future<Output = Result<DriveFile, Self::Err>> + Send;

    /// Download a binary (non-Google-native) file's content.
    fn download_file(
        &self,
        access_token: &str,
        file_id: &str,
    ) -> impl Future<Output = Result<Vec<u8>, Self::Err>> + Send;

    /// Export a Google-native document (Docs/Sheets/Slides) to `export_mime`.
    fn export_file(
        &self,
        access_token: &str,
        file_id: &str,
        export_mime: &str,
    ) -> impl Future<Output = Result<Vec<u8>, Self::Err>> + Send;
}

/// Error returned when resolving a Drive access token.
#[derive(Debug, thiserror::Error)]
pub enum AccessTokenError {
    /// The refresh token is invalid/revoked — the user must reconnect Drive.
    #[error("reauthentication required")]
    ReauthenticationRequired,
    /// Any other failure resolving the token.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// Resolves a fresh Google access token for the connected Drive account.
///
/// Backed by `authentication_service`, which holds the refresh token in
/// FusionAuth and exchanges it for a short-lived access token.
pub trait DriveAccessTokens: Send + Sync + 'static {
    /// Resolve a fresh access token for the given FusionAuth user + Drive email.
    fn retrieve_access_token(
        &self,
        fusionauth_user_id: &Uuid,
        email: &str,
    ) -> impl Future<Output = Result<String, AccessTokenError>> + Send;
}

/// Persistence for `google_drive_links` rows.
pub trait GoogleDriveRepo: Send + Sync + 'static {
    /// Error type returned by repository operations.
    type Err: Into<anyhow::Error> + Send + std::fmt::Debug;

    /// Fetch the user's Drive link, or `None` if they have not connected.
    fn get_link_by_user_id(
        &self,
        macro_user_id: &str,
    ) -> impl Future<Output = Result<Option<GoogleDriveLink>, Self::Err>> + Send;

    /// Insert (or replace) the user's Drive link.
    fn upsert_link(
        &self,
        link: &GoogleDriveLink,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Delete the user's Drive link, if any.
    fn delete_link_by_user_id(
        &self,
        macro_user_id: &str,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;
}

/// Sink that materializes imported Drive content as Macro entities.
///
/// Implemented by the calling service (`document_storage_service`), which owns
/// the Document/Project/S3/foreign-entity machinery. Each method also records
/// the Drive → Macro mapping as a `foreign_entity` row.
pub trait DriveImportSink: Send + Sync + 'static {
    /// Error type returned by sink operations.
    type Err: Into<anyhow::Error> + Send + std::fmt::Debug;

    /// Create a Macro Project mirroring a Drive folder. Returns the new
    /// project id (used as the parent for the folder's children).
    fn create_folder(
        &self,
        macro_user_id: &str,
        name: &str,
        parent_macro_project_id: Option<&str>,
        drive_id: &str,
        web_view_link: Option<&str>,
    ) -> impl Future<Output = Result<String, Self::Err>> + Send;

    /// Create a Macro Document from downloaded Drive content. Returns the new
    /// document id.
    fn import_file(
        &self,
        macro_user_id: &str,
        args: ImportFileArgs,
    ) -> impl Future<Output = Result<String, Self::Err>> + Send;
}

/// High-level Google Drive operations exposed to the inbound HTTP layer.
pub trait GoogleDriveService: Send + Sync + 'static {
    /// List the children of a Drive folder for the folder-picker UI. `None`
    /// lists the Drive root.
    fn list_children(
        &self,
        macro_user_id: &str,
        folder_id: Option<&str>,
        page_token: Option<&str>,
    ) -> impl Future<Output = Result<DriveFileList, GoogleDriveError>> + Send;

    /// Import the selected Drive files/folders into Macro.
    fn import(
        &self,
        macro_user_id: &str,
        request: ImportRequest,
    ) -> impl Future<Output = Result<ImportResult, GoogleDriveError>> + Send;

    /// Whether the user currently has a Drive link row.
    fn is_connected(
        &self,
        macro_user_id: &str,
    ) -> impl Future<Output = Result<bool, GoogleDriveError>> + Send;
}
