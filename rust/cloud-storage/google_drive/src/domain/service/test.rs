use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use uuid::Uuid;

use super::GoogleDriveServiceImpl;
use crate::domain::models::{
    DriveFile, DriveFileList, FOLDER_MIME_TYPE, GoogleDriveError, GoogleDriveLink, ImportFileArgs,
    ImportItem, ImportRequest, ImportedKind,
};
use crate::domain::ports::{
    AccessTokenError, DriveAccessTokens, DriveApi, DriveImportSink, GoogleDriveRepo,
    GoogleDriveService,
};

const USER_ID: &str = "macro|user@example.com";

fn folder(id: &str, name: &str) -> DriveFile {
    DriveFile {
        id: id.to_string(),
        name: name.to_string(),
        mime_type: FOLDER_MIME_TYPE.to_string(),
        parents: vec![],
        size: None,
        modified_time: None,
        web_view_link: None,
        trashed: false,
    }
}

fn file(id: &str, name: &str, mime: &str) -> DriveFile {
    DriveFile {
        id: id.to_string(),
        name: name.to_string(),
        mime_type: mime.to_string(),
        parents: vec![],
        size: Some("10".to_string()),
        modified_time: None,
        web_view_link: Some(format!("https://drive.example/{id}")),
        trashed: false,
    }
}

fn test_link() -> GoogleDriveLink {
    GoogleDriveLink {
        id: Uuid::nil(),
        macro_id: USER_ID.to_string(),
        fusionauth_user_id: Uuid::nil(),
        email: "user@example.com".to_string(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

#[derive(Default)]
struct StubDriveApi {
    files: HashMap<String, DriveFile>,
    children: HashMap<String, Vec<DriveFile>>,
}

impl DriveApi for StubDriveApi {
    type Err = anyhow::Error;

    async fn list_children(
        &self,
        _access_token: &str,
        folder_id: &str,
        _page_token: Option<&str>,
    ) -> Result<DriveFileList, Self::Err> {
        Ok(DriveFileList {
            files: self.children.get(folder_id).cloned().unwrap_or_default(),
            next_page_token: None,
        })
    }

    async fn get_file(&self, _access_token: &str, file_id: &str) -> Result<DriveFile, Self::Err> {
        self.files
            .get(file_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("not found"))
    }

    async fn download_file(
        &self,
        _access_token: &str,
        _file_id: &str,
    ) -> Result<Vec<u8>, Self::Err> {
        Ok(b"binary-content".to_vec())
    }

    async fn export_file(
        &self,
        _access_token: &str,
        _file_id: &str,
        _export_mime: &str,
    ) -> Result<Vec<u8>, Self::Err> {
        Ok(b"exported-content".to_vec())
    }
}

struct StubTokens;

impl DriveAccessTokens for StubTokens {
    async fn retrieve_access_token(
        &self,
        _fusionauth_user_id: &Uuid,
        _email: &str,
    ) -> Result<String, AccessTokenError> {
        Ok("access-token".to_string())
    }
}

#[derive(Clone)]
struct StubRepo {
    link: Option<GoogleDriveLink>,
}

impl GoogleDriveRepo for StubRepo {
    type Err = anyhow::Error;

    async fn get_link_by_user_id(
        &self,
        _macro_user_id: &str,
    ) -> Result<Option<GoogleDriveLink>, Self::Err> {
        Ok(self.link.clone())
    }

    async fn upsert_link(&self, _link: &GoogleDriveLink) -> Result<(), Self::Err> {
        Ok(())
    }

    async fn delete_link_by_user_id(&self, _macro_user_id: &str) -> Result<(), Self::Err> {
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq)]
struct FolderCall {
    name: String,
    parent: Option<String>,
    drive_id: String,
}

#[derive(Clone, Debug, PartialEq)]
struct FileCall {
    name: String,
    drive_id: String,
    mime_type: String,
    parent: Option<String>,
}

#[derive(Clone, Default)]
struct StubSink {
    folder_calls: Arc<Mutex<Vec<FolderCall>>>,
    file_calls: Arc<Mutex<Vec<FileCall>>>,
    counter: Arc<Mutex<u32>>,
}

impl StubSink {
    fn next_id(&self, prefix: &str) -> String {
        let mut counter = self.counter.lock().unwrap();
        *counter += 1;
        format!("{prefix}-{counter}")
    }

    fn folder_calls(&self) -> Vec<FolderCall> {
        self.folder_calls.lock().unwrap().clone()
    }

    fn file_calls(&self) -> Vec<FileCall> {
        self.file_calls.lock().unwrap().clone()
    }
}

impl DriveImportSink for StubSink {
    type Err = anyhow::Error;

    async fn create_folder(
        &self,
        _macro_user_id: &str,
        name: &str,
        parent_macro_project_id: Option<&str>,
        drive_id: &str,
        _web_view_link: Option<&str>,
    ) -> Result<String, Self::Err> {
        self.folder_calls.lock().unwrap().push(FolderCall {
            name: name.to_string(),
            parent: parent_macro_project_id.map(str::to_owned),
            drive_id: drive_id.to_string(),
        });
        Ok(self.next_id("project"))
    }

    async fn import_file(
        &self,
        _macro_user_id: &str,
        args: ImportFileArgs,
    ) -> Result<String, Self::Err> {
        self.file_calls.lock().unwrap().push(FileCall {
            name: args.name,
            drive_id: args.drive_id,
            mime_type: args.mime_type,
            parent: args.parent_macro_project_id,
        });
        Ok(self.next_id("doc"))
    }
}

fn service(
    api: StubDriveApi,
    repo: StubRepo,
    sink: StubSink,
) -> GoogleDriveServiceImpl<StubDriveApi, StubTokens, StubRepo, StubSink> {
    GoogleDriveServiceImpl::new(api, StubTokens, repo, sink)
}

#[tokio::test]
async fn imports_folder_tree_creating_parent_before_children() {
    let reports = folder("f1", "Reports");
    let report_pdf = file("d1", "q3.pdf", "application/pdf");
    let api = StubDriveApi {
        files: HashMap::from([
            ("f1".to_string(), reports),
            ("d1".to_string(), report_pdf.clone()),
        ]),
        children: HashMap::from([("f1".to_string(), vec![report_pdf])]),
    };
    let sink = StubSink::default();
    let service = service(
        api,
        StubRepo {
            link: Some(test_link()),
        },
        sink.clone(),
    );

    let result = service
        .import(
            USER_ID,
            ImportRequest {
                items: vec![ImportItem {
                    drive_id: "f1".to_string(),
                }],
                destination_project_id: None,
            },
        )
        .await
        .expect("import should succeed");

    assert_eq!(result.imported.len(), 2);
    assert_eq!(result.skipped, 0);

    let folder_calls = sink.folder_calls();
    assert_eq!(folder_calls.len(), 1);
    assert_eq!(folder_calls[0].name, "Reports");
    assert_eq!(folder_calls[0].parent, None);
    assert_eq!(folder_calls[0].drive_id, "f1");

    // The file is imported into the project created for its parent folder.
    let file_calls = sink.file_calls();
    assert_eq!(file_calls.len(), 1);
    assert_eq!(file_calls[0].name, "q3.pdf");
    assert_eq!(file_calls[0].parent, Some("project-1".to_string()));

    let folder_entity = result
        .imported
        .iter()
        .find(|e| e.kind == ImportedKind::Folder)
        .unwrap();
    assert_eq!(folder_entity.macro_id, "project-1");
}

#[tokio::test]
async fn exports_google_native_docs_with_extension() {
    let doc = file(
        "d1",
        "Meeting Notes",
        "application/vnd.google-apps.document",
    );
    let api = StubDriveApi {
        files: HashMap::from([("d1".to_string(), doc)]),
        ..StubDriveApi::default()
    };
    let sink = StubSink::default();
    let service = service(
        api,
        StubRepo {
            link: Some(test_link()),
        },
        sink.clone(),
    );

    service
        .import(
            USER_ID,
            ImportRequest {
                items: vec![ImportItem {
                    drive_id: "d1".to_string(),
                }],
                destination_project_id: Some("dest".to_string()),
            },
        )
        .await
        .unwrap();

    let file_calls = sink.file_calls();
    assert_eq!(file_calls.len(), 1);
    // Google Docs export to PDF and land in the chosen destination project.
    assert_eq!(file_calls[0].name, "Meeting Notes.pdf");
    assert_eq!(file_calls[0].parent, Some("dest".to_string()));
}

#[tokio::test]
async fn import_without_link_returns_no_link_found() {
    let service = service(
        StubDriveApi::default(),
        StubRepo { link: None },
        StubSink::default(),
    );

    let err = service
        .import(
            USER_ID,
            ImportRequest {
                items: vec![ImportItem {
                    drive_id: "d1".to_string(),
                }],
                destination_project_id: None,
            },
        )
        .await
        .expect_err("should fail without a link");

    assert!(matches!(err, GoogleDriveError::NoLinkFound));
}

#[tokio::test]
async fn is_connected_reflects_repo_state() {
    let connected = service(
        StubDriveApi::default(),
        StubRepo {
            link: Some(test_link()),
        },
        StubSink::default(),
    );
    assert!(connected.is_connected(USER_ID).await.unwrap());

    let disconnected = service(
        StubDriveApi::default(),
        StubRepo { link: None },
        StubSink::default(),
    );
    assert!(!disconnected.is_connected(USER_ID).await.unwrap());
}
