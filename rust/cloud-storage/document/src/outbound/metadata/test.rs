//! Integration tests for MetadataRepo using sqlx test fixtures.

use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserIdStr;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

fn test_user_id() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from("macro|user@user.com".to_string()).unwrap()
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_document_basic_returns_document(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));

    let result = repo.get_document_basic("document-one").await;
    assert!(result.is_ok(), "Should find document: {:?}", result.err());

    let doc = result.unwrap();
    assert_eq!(doc.document_id, "document-one");
    assert_eq!(doc.document_name, "test_document_name");
    assert_eq!(doc.owner.as_ref(), "macro|user@user.com");
    assert_eq!(doc.file_type.as_deref(), Some("pdf"));
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_document_basic_not_found(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));

    let result = repo.get_document_basic("nonexistent-document").await;
    assert!(matches!(result, Err(DocumentServiceErr::NotFound)));
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_document_list_returns_user_documents(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));
    let user_id = test_user_id();

    let result = repo.get_document_list(user_id).await;
    assert!(
        result.is_ok(),
        "Should get document list: {:?}",
        result.err()
    );

    let docs = result.unwrap();
    assert!(!docs.is_empty(), "User should have at least one document");
    assert!(docs.iter().any(|d| d.document_id == "document-one"));
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_document_list_empty_for_unknown_user(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));
    let unknown_user = MacroUserIdStr::try_from("macro|unknown@test.com".to_string()).unwrap();

    let result = repo.get_document_list(unknown_user).await;
    assert!(result.is_ok());

    let docs = result.unwrap();
    assert!(docs.is_empty(), "Unknown user should have no documents");
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_user_view_location_returns_none_when_not_set(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));
    let user_id = test_user_id();

    let result = repo.get_user_view_location("document-one", user_id).await;
    assert!(result.is_ok());
    assert!(result.unwrap().is_none(), "No view location should be set");
}

#[sqlx::test(
    fixtures(path = "../../../fixtures", scripts("basic_user_with_document")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn test_get_batch_document_previews(pool: Pool<Postgres>) {
    let repo = MetadataRepo::new(Arc::new(pool));

    let result = repo
        .get_batch_document_previews(&["document-one".to_string(), "nonexistent".to_string()])
        .await;
    assert!(result.is_ok(), "Should get previews: {:?}", result.err());

    let previews = result.unwrap();
    assert_eq!(
        previews.len(),
        2,
        "Should return result for each requested ID"
    );

    // Check that document-one was found
    let found_count = previews
        .iter()
        .filter(|p| matches!(p, DocumentPreviewV2::Found(_)))
        .count();
    assert_eq!(found_count, 1, "Should find exactly one document");

    // Check that nonexistent was not found
    let not_found_count = previews
        .iter()
        .filter(|p| matches!(p, DocumentPreviewV2::DoesNotExist(_)))
        .count();
    assert_eq!(
        not_found_count, 1,
        "Should mark nonexistent as DoesNotExist"
    );
}
