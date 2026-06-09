use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::email::EmailStr;
use macro_user_id::user_id::MacroUserIdStr;
use models_email::email::service::link::{Link, UserProvider};
use sqlx::{Pool, Postgres};

async fn insert_imap_link(pool: &Pool<Postgres>, email: &str) -> anyhow::Result<Link> {
    let link = Link {
        id: macro_uuid::generate_uuid_v7(),
        macro_id: MacroUserIdStr::try_from(format!("macro|{email}"))?,
        fusionauth_user_id: "22222222-2222-2222-2222-222222222222".to_string(),
        email_address: EmailStr::try_from(email.to_string())?,
        provider: UserProvider::ImapSmtp,
        is_sync_active: true,
        created_at: Default::default(),
        updated_at: Default::default(),
    };

    let mut tx = pool.begin().await?;
    let inserted = crate::links::insert::upsert_link(&mut tx, link).await?;
    tx.commit().await?;
    Ok(inserted)
}

fn test_credentials(link_id: sqlx::types::Uuid) -> DbImapSmtpCredentials {
    DbImapSmtpCredentials {
        link_id,
        imap_host: "imap.example.com".to_string(),
        imap_port: 993,
        imap_security: DbConnectionSecurity::SslTls,
        imap_username: "user@example.com".to_string(),
        imap_password_ciphertext: vec![1, 2, 3],
        smtp_host: "smtp.example.com".to_string(),
        smtp_port: 587,
        smtp_security: DbConnectionSecurity::Starttls,
        smtp_username: "user@example.com".to_string(),
        smtp_password_ciphertext: vec![4, 5, 6],
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn upsert_and_fetch_credentials_roundtrip(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link = insert_imap_link(&pool, "user@example.com").await?;

    let credentials = test_credentials(link.id);
    upsert_credentials(&pool, &credentials).await?;

    let fetched = fetch_credentials_by_link_id(&pool, link.id)
        .await?
        .expect("credentials should exist");
    assert_eq!(fetched.imap_host, "imap.example.com");
    assert_eq!(fetched.imap_port, 993);
    assert_eq!(fetched.imap_security, DbConnectionSecurity::SslTls);
    assert_eq!(fetched.imap_password_ciphertext, vec![1, 2, 3]);
    assert_eq!(fetched.smtp_security, DbConnectionSecurity::Starttls);
    assert_eq!(fetched.smtp_port, 587);

    // Upsert with new values replaces the row.
    let mut updated = test_credentials(link.id);
    updated.imap_host = "imap2.example.com".to_string();
    updated.imap_password_ciphertext = vec![9, 9];
    upsert_credentials(&pool, &updated).await?;

    let fetched = fetch_credentials_by_link_id(&pool, link.id)
        .await?
        .expect("credentials should exist");
    assert_eq!(fetched.imap_host, "imap2.example.com");
    assert_eq!(fetched.imap_password_ciphertext, vec![9, 9]);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn fetch_credentials_missing_returns_none(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link = insert_imap_link(&pool, "user@example.com").await?;
    assert!(
        fetch_credentials_by_link_id(&pool, link.id)
            .await?
            .is_none()
    );
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn credentials_cascade_on_link_delete(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link = insert_imap_link(&pool, "user@example.com").await?;
    upsert_credentials(&pool, &test_credentials(link.id)).await?;
    upsert_folder_state(&pool, link.id, "INBOX", 1, 10).await?;

    crate::links::delete::delete_link_by_id(&pool, link.id).await?;

    assert!(
        fetch_credentials_by_link_id(&pool, link.id)
            .await?
            .is_none()
    );
    assert!(fetch_folder_states(&pool, link.id).await?.is_empty());
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn folder_state_upsert_and_fetch(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let link = insert_imap_link(&pool, "user@example.com").await?;

    upsert_folder_state(&pool, link.id, "INBOX", 100, 5).await?;
    upsert_folder_state(&pool, link.id, "Sent", 200, 7).await?;

    let mut states = fetch_folder_states(&pool, link.id).await?;
    states.sort_by(|a, b| a.folder.cmp(&b.folder));
    assert_eq!(states.len(), 2);
    assert_eq!(states[0].folder, "INBOX");
    assert_eq!(states[0].uid_validity, 100);
    assert_eq!(states[0].last_seen_uid, 5);

    // UIDVALIDITY change resets the stored state via upsert.
    upsert_folder_state(&pool, link.id, "INBOX", 101, 0).await?;
    let states = fetch_folder_states(&pool, link.id).await?;
    let inbox = states.iter().find(|s| s.folder == "INBOX").unwrap();
    assert_eq!(inbox.uid_validity, 101);
    assert_eq!(inbox.last_seen_uid, 0);

    Ok(())
}
