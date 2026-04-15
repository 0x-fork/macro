//! Tests for email contact search module

use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserId;
use models_search_cursor::SearchCursorOption;
use sqlx::{Pool, Postgres};

use super::*;

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_empty_term(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let result = search_email_contacts(&pool, user_id, "".to_string(), 10).await;

    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        EmailContactSearchError::EmptySearchTerm
    ));

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_finds_sender(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let response =
        search_email_contacts(&pool, user_id, "alice@example.com".to_string(), 10, None).await?;

    assert!(!response.items.is_empty());

    let from_match = response.items.iter().find(|r| {
        matches!(r.contact_type, ContactType::From) && r.contact_email == "alice@example.com"
    });
    assert!(from_match.is_some());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_finds_recipients(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let response = search_email_contacts(
        &pool,
        user_id,
        "bob.johnson@example.com".to_string(),
        10,
        None,
    )
    .await?;

    assert!(!response.items.is_empty());

    let cc_match = response.items.iter().find(|r| {
        matches!(r.contact_type, ContactType::Cc)
            && r.contact_email == "bob.johnson@example.com"
            && r.thread_id.to_string() == "11111111-1111-1111-1111-111111111111"
    });
    assert!(cc_match.is_some());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_finds_bcc_recipients(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let response =
        search_email_contacts(&pool, user_id, "david@example.com".to_string(), 10, None).await?;

    assert!(!response.items.is_empty());

    let bcc_match = response.items.iter().find(|r| {
        matches!(r.contact_type, ContactType::Bcc)
            && r.contact_email == "david@example.com"
            && r.thread_id.to_string() == "22222222-2222-2222-2222-222222222222"
    });
    assert!(bcc_match.is_some());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_sorted_by_latest_message(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    // alice@example.com appears in thread 1 (Dec 6) and thread 2 (Dec 5)
    let response =
        search_email_contacts(&pool, user_id, "alice@example.com".to_string(), 10, None).await?;

    assert!(!response.items.is_empty());

    if response.items.len() >= 2 {
        assert_eq!(
            response.items[0].thread_id.to_string(),
            "11111111-1111-1111-1111-111111111111"
        );
    }

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_case_insensitive(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let response_lower = search_email_contacts(
        &pool,
        user_id.clone(),
        "alice@example.com".to_string(),
        10,
        None,
    )
    .await?;
    let response_upper = search_email_contacts(
        &pool,
        user_id.clone(),
        "ALICE@EXAMPLE.COM".to_string(),
        10,
        None,
    )
    .await?;
    let response_mixed =
        search_email_contacts(&pool, user_id, "Alice@Example.Com".to_string(), 10, None).await?;

    assert_eq!(response_lower.items.len(), response_upper.items.len());
    assert_eq!(response_lower.items.len(), response_mixed.items.len());
    assert!(!response_lower.items.is_empty());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_user_isolation(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    // frank@example.com belongs to user2, not user1
    let response =
        search_email_contacts(&pool, user_id, "frank@example.com".to_string(), 10, None).await?;

    assert_eq!(response.items.len(), 0);
    assert!(response.cursor.is_done());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_no_results(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    let response = search_email_contacts(
        &pool,
        user_id,
        "nonexistent@example.com".to_string(),
        10,
        None,
    )
    .await?;

    assert_eq!(response.items.len(), 0);
    assert!(response.cursor.is_done());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("email_contacts"))
)]
async fn test_search_email_contacts_pagination_by_thread(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let user_id = MacroUserId::parse_from_str("macro|user1@test.com")
        .map(|l| l.lowercase())
        .unwrap();

    // alice@example.com appears in thread 1 (Dec 6) and thread 2 (Dec 5)
    let page1 = search_email_contacts(
        &pool,
        user_id.clone(),
        "alice@example.com".to_string(),
        1,
        None,
    )
    .await?;

    assert!(!page1.items.is_empty());
    let page1_thread_ids: std::collections::HashSet<_> =
        page1.items.iter().map(|r| r.thread_id).collect();
    assert_eq!(page1_thread_ids.len(), 1);
    assert!(
        page1_thread_ids
            .contains(&uuid::Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap())
    );
    assert!(page1.cursor.has_more());

    let cursor1 = match page1.cursor {
        SearchCursorOption::NotDone(c) => c,
        SearchCursorOption::Done => panic!("Expected more results"),
    };

    let page2 = search_email_contacts(
        &pool,
        user_id.clone(),
        "alice@example.com".to_string(),
        1,
        cursor1,
    )
    .await?;

    assert!(!page2.items.is_empty());
    let page2_thread_ids: std::collections::HashSet<_> =
        page2.items.iter().map(|r| r.thread_id).collect();
    assert_eq!(page2_thread_ids.len(), 1);
    assert!(
        page2_thread_ids
            .contains(&uuid::Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap())
    );

    assert!(page1_thread_ids.is_disjoint(&page2_thread_ids));
    assert!(page2.cursor.is_done());

    Ok(())
}
