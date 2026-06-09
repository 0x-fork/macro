//! [`DriveImportSink`] adapter: materializes imported Google Drive content as
//! Macro Projects and Documents.
//!
//! This is the Macro-storage half of the Google Drive import. It reuses the
//! existing document-creation pipeline (presigned upload + content lifecycle,
//! the same path [`documents_hex`]'s `create_text_file` uses) and the project
//! creation helper, and records each Drive → Macro mapping as a
//! `foreign_entity` row so imports can later be de-duplicated and traced back
//! to their source.

use anyhow::Context;
use base64::Engine;
use documents_hex::domain::content::DocumentContent;
use documents_hex::domain::models::CreateDocumentRepoArgs;
use documents_hex::domain::ports::create::{
    DocumentBytesUpload, DocumentBytesUploadPort, DocumentCreationService,
};
use foreign_entity::domain::models::CreateForeignEntity;
use foreign_entity::domain::ports::ForeignEntityService;
use google_drive::domain::models::{GOOGLE_DRIVE_FOREIGN_ENTITY_SOURCE, ImportFileArgs};
use google_drive::domain::ports::DriveImportSink;
use macro_user_id::user_id::MacroUserIdStr;
use model::document::{FileType, FileTypeExt};
use models_permissions::share_permission::SharePermissionV2;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

/// The `stored_for_auth_entity` namespace for per-user imports.
const STORED_FOR_USER: &str = "user";

/// Sink that writes imported Drive content into Macro storage.
///
/// The service/foreign-entity ports are stored behind `Arc` (mirroring
/// `GithubSyncServiceImpl`) so the generic params are the concrete inner types
/// — `ForeignEntityService` has no blanket `Arc<T>` impl, so we can't hand it an
/// `Arc` as the type parameter directly.
pub struct GoogleDriveImportSink<DSvc, Upload, FE> {
    document_service: Arc<DSvc>,
    bytes_uploader: Upload,
    foreign_entity_service: Arc<FE>,
    db: PgPool,
}

impl<DSvc, Upload, FE> GoogleDriveImportSink<DSvc, Upload, FE>
where
    DSvc: DocumentCreationService,
    Upload: DocumentBytesUploadPort,
    FE: ForeignEntityService,
{
    /// Create a new sink from the document-creation pipeline, a bytes uploader,
    /// the foreign-entity service, and a DB pool (for project creation).
    pub fn new(
        document_service: Arc<DSvc>,
        bytes_uploader: Upload,
        foreign_entity_service: Arc<FE>,
        db: PgPool,
    ) -> Self {
        Self {
            document_service,
            bytes_uploader,
            foreign_entity_service,
            db,
        }
    }

    /// Best-effort: record a Drive id → Macro entity id mapping. Failures are
    /// logged but never fail the import (the entity is already created).
    async fn record_foreign_entity(
        &self,
        drive_id: &str,
        owner_macro_user_id: &str,
        macro_entity_id: &str,
        kind: &str,
        name: &str,
        web_view_link: Option<&str>,
        mime_type: Option<&str>,
    ) {
        let metadata = serde_json::json!({
            "kind": kind,
            "macroId": macro_entity_id,
            "name": name,
            "webViewLink": web_view_link,
            "mimeType": mime_type,
        });

        let _ = self
            .foreign_entity_service
            .create_foreign_entity(CreateForeignEntity {
                foreign_entity_id: drive_id.to_string(),
                foreign_entity_source: GOOGLE_DRIVE_FOREIGN_ENTITY_SOURCE.to_string(),
                metadata,
                stored_for_id: owner_macro_user_id.to_string(),
                stored_for_auth_entity: STORED_FOR_USER.to_string(),
            })
            .await
            .inspect_err(|e| {
                tracing::warn!(error = ?e, drive_id, "failed to record google drive foreign entity")
            });
    }
}

impl<DSvc, Upload, FE> DriveImportSink for GoogleDriveImportSink<DSvc, Upload, FE>
where
    DSvc: DocumentCreationService,
    Upload: DocumentBytesUploadPort,
    FE: ForeignEntityService,
{
    type Err = anyhow::Error;

    #[tracing::instrument(skip(self), err)]
    async fn create_folder(
        &self,
        macro_user_id: &str,
        name: &str,
        parent_macro_project_id: Option<&str>,
        drive_id: &str,
        web_view_link: Option<&str>,
    ) -> Result<String, Self::Err> {
        let user_id = MacroUserIdStr::parse_from_str(macro_user_id)
            .map_err(|e| anyhow::anyhow!("invalid macro user id: {e}"))?
            .into_owned();

        let share_permission = SharePermissionV2::new_project_share_permission();
        let project = macro_db_client::projects::create_project_v2(
            self.db.clone(),
            user_id,
            name,
            parent_macro_project_id.map(str::to_owned),
            &share_permission,
        )
        .await
        .context("failed to create project for imported drive folder")?;

        self.record_foreign_entity(
            drive_id,
            macro_user_id,
            &project.id,
            "folder",
            name,
            web_view_link,
            None,
        )
        .await;

        Ok(project.id)
    }

    #[tracing::instrument(skip(self, args), fields(drive_id = %args.drive_id, name = %args.name), err)]
    async fn import_file(
        &self,
        macro_user_id: &str,
        args: ImportFileArgs,
    ) -> Result<String, Self::Err> {
        let user_id = MacroUserIdStr::parse_from_str(macro_user_id)
            .map_err(|e| anyhow::anyhow!("invalid macro user id: {e}"))?
            .into_owned();

        // Split the name into a stem + recognized extension to derive the file
        // type (Drive-native docs were already exported to a concrete format).
        let (document_name, file_type) = match FileType::split_suffix_match(&args.name) {
            Some((stem, ext)) => (stem.to_string(), FileType::from_str(ext).ok()),
            None => (args.name.clone(), None),
        };

        let project_id = match &args.parent_macro_project_id {
            Some(id) => Some(Uuid::parse_str(id).context("invalid parent project id")?),
            None => None,
        };

        let shas = file_shas(&args.content);
        let repo_args = CreateDocumentRepoArgs {
            id: None,
            sha: shas.hex,
            document_name,
            user_id: user_id.clone(),
            file_type,
            project_id,
            team_id: None,
            email_attachment_id: None,
            created_at: None,
            is_task: false,
            skip_history: false,
        };

        let response = self
            .document_service
            .create_document(user_id, repo_args, None)
            .await
            .context("failed to create document row for imported drive file")?;

        let document_id = response
            .document_response
            .document_metadata
            .metadata
            .document_id
            .clone();

        // Upload the content to the presigned URL, then mark the content ready.
        // On any failure, clean up the half-created document.
        let finalize = async {
            let presigned_url = response
                .document_response
                .presigned_url
                .as_ref()
                .context("expected a presigned upload url")?;

            self.bytes_uploader
                .upload_document_bytes(DocumentBytesUpload {
                    presigned_url: presigned_url.clone(),
                    content_type: response.content_type.clone(),
                    base64_sha256: shas.base64,
                    bytes: args.content,
                })
                .await
                .context("failed to upload imported drive file content")?;

            self.document_service
                .set_document_content(
                    &document_id,
                    DocumentContent::from_legacy_uploaded(true, file_type),
                )
                .await
                .context("failed to mark imported document content ready")?;

            Ok::<(), anyhow::Error>(())
        }
        .await;

        if let Err(error) = finalize {
            self.document_service
                .cleanup_created_document(&document_id)
                .await;
            return Err(error);
        }

        self.record_foreign_entity(
            &args.drive_id,
            macro_user_id,
            &document_id,
            "document",
            &args.name,
            args.web_view_link.as_deref(),
            Some(&args.mime_type),
        )
        .await;

        Ok(document_id)
    }
}

struct FileShas {
    hex: String,
    base64: String,
}

/// Compute the hex and base64 SHA-256 of the content, matching the document
/// service's expectations (hex for the row, base64 for the S3 checksum header).
fn file_shas(content: &[u8]) -> FileShas {
    let digest = Sha256::digest(content);
    FileShas {
        hex: format!("{digest:x}"),
        base64: base64::engine::general_purpose::STANDARD.encode(digest),
    }
}
