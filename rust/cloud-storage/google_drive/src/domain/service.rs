//! Concrete [`GoogleDriveService`] implementation.
//!
//! Orchestrates browse + import by composing the [`DriveApi`],
//! [`DriveAccessTokens`], [`GoogleDriveRepo`], and [`DriveImportSink`] ports.
//! Import is performed with an explicit work-stack (rather than async
//! recursion) so parents are always created before their children.

#[cfg(test)]
mod test;

use crate::domain::models::{
    DriveFile, DriveFileList, GoogleDriveError, GoogleDriveLink, ImportFileArgs, ImportItem,
    ImportRequest, ImportResult, ImportedEntity, ImportedKind, export_target_for,
};
use crate::domain::ports::{
    AccessTokenError, DriveAccessTokens, DriveApi, DriveImportSink, GoogleDriveRepo,
    GoogleDriveService,
};

/// Safety cap on the number of entities a single import may create, to bound
/// runaway recursion over very large Drives. Items beyond the cap are skipped.
const MAX_IMPORT_ENTITIES: usize = 5_000;

/// The special Drive id that refers to the user's root folder.
const DRIVE_ROOT: &str = "root";

/// Composes the Drive ports into the high-level browse/import service.
pub struct GoogleDriveServiceImpl<A, T, R, S> {
    drive_api: A,
    tokens: T,
    repo: R,
    sink: S,
}

impl<A, T, R, S> GoogleDriveServiceImpl<A, T, R, S>
where
    A: DriveApi,
    T: DriveAccessTokens,
    R: GoogleDriveRepo,
    S: DriveImportSink,
{
    /// Create a new service from its port adapters.
    pub fn new(drive_api: A, tokens: T, repo: R, sink: S) -> Self {
        Self {
            drive_api,
            tokens,
            repo,
            sink,
        }
    }

    /// Resolve the user's link + a fresh access token, mapping the absence of a
    /// link to [`GoogleDriveError::NoLinkFound`] and a revoked refresh token to
    /// [`GoogleDriveError::ReauthenticationRequired`].
    async fn resolve_session(
        &self,
        macro_user_id: &str,
    ) -> Result<(GoogleDriveLink, String), GoogleDriveError> {
        let link = self
            .repo
            .get_link_by_user_id(macro_user_id)
            .await
            .map_err(|e| GoogleDriveError::Internal(e.into()))?
            .ok_or(GoogleDriveError::NoLinkFound)?;

        let access_token = self
            .tokens
            .retrieve_access_token(&link.fusionauth_user_id, &link.email)
            .await
            .map_err(|e| match e {
                AccessTokenError::ReauthenticationRequired => {
                    GoogleDriveError::ReauthenticationRequired
                }
                AccessTokenError::Internal(e) => GoogleDriveError::Internal(e),
            })?;

        Ok((link, access_token))
    }

    fn drive_err(e: A::Err) -> GoogleDriveError {
        GoogleDriveError::Internal(e.into())
    }

    fn sink_err(e: S::Err) -> GoogleDriveError {
        GoogleDriveError::Internal(e.into())
    }

    /// Fetch every child of a folder, following pagination.
    async fn list_all_children(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<Vec<DriveFile>, GoogleDriveError> {
        let mut all = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let DriveFileList {
                files,
                next_page_token,
            } = self
                .drive_api
                .list_children(access_token, folder_id, page_token.as_deref())
                .await
                .map_err(Self::drive_err)?;
            all.extend(files);
            match next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }
        Ok(all)
    }

    /// Download (or export) a single Drive file and hand it to the sink as a
    /// Macro Document. Returns the new document id.
    async fn import_single_file(
        &self,
        macro_user_id: &str,
        access_token: &str,
        file: &DriveFile,
        parent_macro_project_id: Option<&str>,
    ) -> Result<String, GoogleDriveError> {
        let (content, name) = match export_target_for(&file.mime_type) {
            // Google-native doc: export to a concrete format and append the ext.
            Some(target) => {
                let bytes = self
                    .drive_api
                    .export_file(access_token, &file.id, target.export_mime)
                    .await
                    .map_err(Self::drive_err)?;
                (bytes, format!("{}.{}", file.name, target.extension))
            }
            // Regular binary file: download as-is.
            None => {
                let bytes = self
                    .drive_api
                    .download_file(access_token, &file.id)
                    .await
                    .map_err(Self::drive_err)?;
                (bytes, file.name.clone())
            }
        };

        self.sink
            .import_file(
                macro_user_id,
                ImportFileArgs {
                    drive_id: file.id.clone(),
                    name,
                    mime_type: file.mime_type.clone(),
                    web_view_link: file.web_view_link.clone(),
                    parent_macro_project_id: parent_macro_project_id.map(str::to_owned),
                    content,
                },
            )
            .await
            .map_err(Self::sink_err)
    }
}

/// A node still to be imported, paired with the Macro project it should land in.
struct PendingNode {
    file: DriveFile,
    parent_macro_project_id: Option<String>,
}

impl<A, T, R, S> GoogleDriveService for GoogleDriveServiceImpl<A, T, R, S>
where
    A: DriveApi,
    T: DriveAccessTokens,
    R: GoogleDriveRepo,
    S: DriveImportSink,
{
    #[tracing::instrument(skip(self), err)]
    async fn list_children(
        &self,
        macro_user_id: &str,
        folder_id: Option<&str>,
        page_token: Option<&str>,
    ) -> Result<DriveFileList, GoogleDriveError> {
        let (_link, access_token) = self.resolve_session(macro_user_id).await?;
        self.drive_api
            .list_children(&access_token, folder_id.unwrap_or(DRIVE_ROOT), page_token)
            .await
            .map_err(Self::drive_err)
    }

    #[tracing::instrument(skip(self, request), fields(item_count = request.items.len()), err)]
    async fn import(
        &self,
        macro_user_id: &str,
        request: ImportRequest,
    ) -> Result<ImportResult, GoogleDriveError> {
        let (_link, access_token) = self.resolve_session(macro_user_id).await?;
        let mut result = ImportResult::default();

        // Seed the work-stack with the selected items, resolving authoritative
        // metadata from Drive (don't trust the client's notion of type).
        let mut stack: Vec<PendingNode> = Vec::new();
        for ImportItem { drive_id } in request.items {
            let file = self
                .drive_api
                .get_file(&access_token, &drive_id)
                .await
                .map_err(Self::drive_err)?;
            stack.push(PendingNode {
                file,
                parent_macro_project_id: request.destination_project_id.clone(),
            });
        }

        while let Some(PendingNode {
            file,
            parent_macro_project_id,
        }) = stack.pop()
        {
            if file.trashed {
                result.skip();
                continue;
            }
            if result.imported.len() >= MAX_IMPORT_ENTITIES {
                result.skip();
                continue;
            }

            if file.is_folder() {
                let project_id = self
                    .sink
                    .create_folder(
                        macro_user_id,
                        &file.name,
                        parent_macro_project_id.as_deref(),
                        &file.id,
                        file.web_view_link.as_deref(),
                    )
                    .await
                    .map_err(Self::sink_err)?;

                let children = self.list_all_children(&access_token, &file.id).await?;
                for child in children {
                    stack.push(PendingNode {
                        file: child,
                        parent_macro_project_id: Some(project_id.clone()),
                    });
                }

                result.push(ImportedEntity {
                    drive_id: file.id,
                    macro_id: project_id,
                    kind: ImportedKind::Folder,
                    name: file.name,
                });
            } else {
                let document_id = self
                    .import_single_file(
                        macro_user_id,
                        &access_token,
                        &file,
                        parent_macro_project_id.as_deref(),
                    )
                    .await?;

                result.push(ImportedEntity {
                    drive_id: file.id,
                    macro_id: document_id,
                    kind: ImportedKind::Document,
                    name: file.name,
                });
            }
        }

        Ok(result)
    }

    #[tracing::instrument(skip(self), err)]
    async fn is_connected(&self, macro_user_id: &str) -> Result<bool, GoogleDriveError> {
        Ok(self
            .repo
            .get_link_by_user_id(macro_user_id)
            .await
            .map_err(|e| GoogleDriveError::Internal(e.into()))?
            .is_some())
    }
}
