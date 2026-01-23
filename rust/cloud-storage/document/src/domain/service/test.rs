//! Unit tests for the document service.

use super::*;
use crate::domain::ports::{MockDocumentMetadataRepo, MockDocumentStorageRepo};
use chrono::Utc;
use entity_access::domain::models::AccessError;
use macro_user_id::lowercased::Lowercase;
use macro_user_id::user_id::MacroUserId;
use model::document::{DocumentMetadata, DocumentPreviewData, response::GetDocumentListResult};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Mock EntityAccessService for testing.
#[derive(Clone)]
struct MockEntityAccess {
    access_level: Arc<Mutex<Option<AccessLevel>>>,
}

impl MockEntityAccess {
    fn new() -> Self {
        Self {
            access_level: Arc::new(Mutex::new(None)),
        }
    }

    fn with_access(mut self, level: AccessLevel) -> Self {
        self.access_level = Arc::new(Mutex::new(Some(level)));
        self
    }
}

impl EntityAccessService for MockEntityAccess {
    async fn get_access_level(
        &self,
        _user_id: &MacroUserId<Lowercase<'_>>,
        _entity_id: &str,
        _entity_type: EntityType,
    ) -> std::result::Result<Option<AccessLevel>, AccessError> {
        Ok(*self.access_level.lock().await)
    }

    async fn check_access(
        &self,
        _user_id: &MacroUserId<Lowercase<'_>>,
        _entity_id: &str,
        _entity_type: EntityType,
        required_level: AccessLevel,
    ) -> std::result::Result<AccessLevel, AccessError> {
        let level = self.access_level.lock().await;
        match *level {
            Some(l) if l >= required_level => Ok(l),
            _ => Err(AccessError::Unauthorized),
        }
    }
}

fn test_user_id() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from("macro|test@test.com".to_string()).unwrap()
}

fn make_document_basic(owner: &str, deleted: bool) -> DocumentBasic {
    DocumentBasic {
        document_id: "doc-123".to_string(),
        document_name: "Test Document".to_string(),
        owner: MacroUserIdStr::try_from(owner.to_string()).unwrap(),
        file_type: Some("pdf".to_string()),
        branched_from_id: None,
        branched_from_version_id: None,
        document_family_id: None,
        project_id: None,
        deleted_at: if deleted {
            Some(Utc::now())
        } else {
            None
        },
    }
}

fn make_document_metadata() -> DocumentMetadata {
    DocumentMetadata {
        document_id: "doc-123".to_string(),
        document_version_id: 1,
        owner: MacroUserIdStr::try_from("macro|test@test.com".to_string()).unwrap(),
        document_name: "Test Document".to_string(),
        file_type: Some("pdf".to_string()),
        sha: None,
        project_id: None,
        project_name: None,
        branched_from_id: None,
        branched_from_version_id: None,
        document_family_id: None,
        document_bom: None,
        modification_data: None,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
        sub_type: None,
    }
}

// =============================================================================
// get_document tests
// =============================================================================

#[tokio::test]
async fn test_get_document_owner_has_full_access() {
    let user_id = test_user_id();
    let user_str = user_id.as_ref().to_string();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(move |_| {
            let owner = user_str.clone();
            Box::pin(async move { Ok(make_document_basic(&owner, false)) })
        });
    mock_metadata
        .expect_get_document_metadata()
        .returning(|_, _| Box::pin(async { Ok(make_document_metadata()) }));
    mock_metadata
        .expect_get_user_view_location()
        .returning(|_, _| Box::pin(async { Ok(Some("page-5".to_string())) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(result.is_ok());

    let output = result.unwrap();
    assert_eq!(output.user_access_level, AccessLevel::Owner);
    assert_eq!(output.view_location, Some("page-5".to_string()));
}

#[tokio::test]
async fn test_get_document_non_owner_with_view_access() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(|_| Box::pin(async { Ok(make_document_basic("macro|other@test.com", false)) }));
    mock_metadata
        .expect_get_document_metadata()
        .returning(|_, _| Box::pin(async { Ok(make_document_metadata()) }));
    mock_metadata
        .expect_get_user_view_location()
        .returning(|_, _| Box::pin(async { Ok(None) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new().with_access(AccessLevel::View);

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(result.is_ok());

    let output = result.unwrap();
    assert_eq!(output.user_access_level, AccessLevel::View);
}

#[tokio::test]
async fn test_get_document_non_owner_no_access() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(|_| Box::pin(async { Ok(make_document_basic("macro|other@test.com", false)) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new(); // No access configured

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(matches!(result, Err(DocumentServiceErr::Unauthorized)));
}

#[tokio::test]
async fn test_get_document_deleted_non_owner_unauthorized() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(|_| Box::pin(async { Ok(make_document_basic("macro|other@test.com", true)) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new().with_access(AccessLevel::Edit);

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(matches!(
        result,
        Err(DocumentServiceErr::UnauthorizedWithMsg(_))
    ));
}

#[tokio::test]
async fn test_get_document_deleted_owner_has_access() {
    let user_id = test_user_id();
    let user_str = user_id.as_ref().to_string();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata.expect_get_document_basic().returning(move |_| {
        let owner = user_str.clone();
        Box::pin(async move { Ok(make_document_basic(&owner, true)) })
    });
    mock_metadata
        .expect_get_document_metadata()
        .returning(|_, _| Box::pin(async { Ok(make_document_metadata()) }));
    mock_metadata
        .expect_get_user_view_location()
        .returning(|_, _| Box::pin(async { Ok(None) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().user_access_level, AccessLevel::Owner);
}

#[tokio::test]
async fn test_get_document_not_found() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(|_| Box::pin(async { Err(DocumentServiceErr::NotFound) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document("doc-123", user_id).await;
    assert!(matches!(result, Err(DocumentServiceErr::NotFound)));
}

// =============================================================================
// get_document_text tests
// =============================================================================

#[tokio::test]
async fn test_get_document_text_pdf_returns_plaintext() {
    let user_id = test_user_id();
    let user_str = user_id.as_ref().to_string();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata.expect_get_document_basic().returning(move |_| {
        let owner = user_str.clone();
        Box::pin(async move { Ok(make_document_basic(&owner, false)) })
    });
    mock_metadata
        .expect_get_extracted_text()
        .returning(|_, _| Box::pin(async { Ok(Some("Extracted PDF text content".to_string())) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_text("doc-123", user_id).await;
    assert!(result.is_ok());

    match result.unwrap() {
        DocumentText::PlainText(text) => assert_eq!(text, "Extracted PDF text content"),
        DocumentText::LexicalJson(_) => panic!("Expected PlainText for PDF"),
    }
}

#[tokio::test]
async fn test_get_document_text_markdown_returns_lexical_json() {
    let user_id = test_user_id();
    let user_str = user_id.as_ref().to_string();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata.expect_get_document_basic().returning(move |_| {
        let owner = user_str.clone();
        Box::pin(async move {
            let mut doc = make_document_basic(&owner, false);
            doc.file_type = Some("md".to_string());
            Ok(doc)
        })
    });

    let mut mock_storage = MockDocumentStorageRepo::new();
    mock_storage
        .expect_get_md_text()
        .returning(|_| Box::pin(async { Ok(r#"{"root":{"children":[]}}"#.to_string()) }));

    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_text("doc-123", user_id).await;
    assert!(result.is_ok());

    match result.unwrap() {
        DocumentText::LexicalJson(json) => assert!(json.contains("root")),
        DocumentText::PlainText(_) => panic!("Expected LexicalJson for markdown"),
    }
}

#[tokio::test]
async fn test_get_document_text_no_extracted_text_returns_not_found() {
    let user_id = test_user_id();
    let user_str = user_id.as_ref().to_string();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata.expect_get_document_basic().returning(move |_| {
        let owner = user_str.clone();
        Box::pin(async move { Ok(make_document_basic(&owner, false)) })
    });
    mock_metadata
        .expect_get_extracted_text()
        .returning(|_, _| Box::pin(async { Ok(None) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_text("doc-123", user_id).await;
    assert!(matches!(result, Err(DocumentServiceErr::NotFound)));
}

#[tokio::test]
async fn test_get_document_text_unauthorized() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_basic()
        .returning(|_| Box::pin(async { Ok(make_document_basic("macro|other@test.com", false)) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new(); // No access

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_text("doc-123", user_id).await;
    assert!(matches!(result, Err(DocumentServiceErr::Unauthorized)));
}

// =============================================================================
// get_document_list tests
// =============================================================================

#[tokio::test]
async fn test_get_document_list_returns_user_documents() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata.expect_get_document_list().returning(|_| {
        Box::pin(async {
            Ok(vec![
                GetDocumentListResult {
                    document_id: "doc-1".to_string(),
                    document_version_id: 1,
                    document_name: "Doc 1".to_string(),
                    file_type: Some("pdf".to_string()),
                    branched_from_id: None,
                    branched_from_version_id: None,
                    document_family_id: None,
                    created_at: Some(Utc::now()),
                    updated_at: Some(Utc::now()),
                },
                GetDocumentListResult {
                    document_id: "doc-2".to_string(),
                    document_version_id: 2,
                    document_name: "Doc 2".to_string(),
                    file_type: Some("pdf".to_string()),
                    branched_from_id: None,
                    branched_from_version_id: None,
                    document_family_id: None,
                    created_at: Some(Utc::now()),
                    updated_at: Some(Utc::now()),
                },
            ])
        })
    });

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_list(user_id).await;
    assert!(result.is_ok());

    let docs = result.unwrap();
    assert_eq!(docs.len(), 2);
    assert_eq!(docs[0].document_id, "doc-1");
    assert_eq!(docs[1].document_id, "doc-2");
}

#[tokio::test]
async fn test_get_document_list_empty() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_document_list()
        .returning(|_| Box::pin(async { Ok(vec![]) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_document_list(user_id).await;
    assert!(result.is_ok());
    assert!(result.unwrap().is_empty());
}

// =============================================================================
// get_batch_previews tests
// =============================================================================

#[tokio::test]
async fn test_get_batch_previews_returns_previews() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_batch_document_previews()
        .returning(|_| {
            Box::pin(async {
                Ok(vec![DocumentPreviewV2::Found(DocumentPreviewData {
                    document_id: "doc-1".to_string(),
                    document_name: "Doc 1".to_string(),
                    file_type: Some("pdf".to_string()),
                    owner: "macro|test@test.com".to_string(),
                    updated_at: Some(Utc::now()),
                    sub_type: None,
                })])
            })
        });

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service
        .get_batch_previews(&["doc-1".to_string()], user_id)
        .await;
    assert!(result.is_ok());

    let previews = result.unwrap();
    assert_eq!(previews.len(), 1);
    match &previews[0] {
        DocumentPreviewV2::Found(data) => {
            assert_eq!(data.document_id, "doc-1");
        }
        DocumentPreviewV2::DoesNotExist(_) => panic!("Expected Found variant"),
    }
}

#[tokio::test]
async fn test_get_batch_previews_empty_request() {
    let user_id = test_user_id();

    let mut mock_metadata = MockDocumentMetadataRepo::new();
    mock_metadata
        .expect_get_batch_document_previews()
        .returning(|_| Box::pin(async { Ok(vec![]) }));

    let mock_storage = MockDocumentStorageRepo::new();
    let mock_access = MockEntityAccess::new();

    let service = DocumentServiceImpl::new(
        Arc::new(mock_access),
        Arc::new(mock_storage),
        Arc::new(mock_metadata),
    );

    let result = service.get_batch_previews(&[], user_id).await;
    assert!(result.is_ok());
    assert!(result.unwrap().is_empty());
}
