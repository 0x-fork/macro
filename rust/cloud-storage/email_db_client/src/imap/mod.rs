//! Storage for IMAP/SMTP link connection settings and per-folder sync state.
//!
//! Passwords are stored as AES-256-GCM ciphertext (see
//! `email_utils::credential_crypto`); this module only ever sees the
//! ciphertext bytes.

use models_email::service::imap::ConnectionSecurity;
use sqlx::PgPool;
use sqlx::types::Uuid;

#[cfg(test)]
mod test;

/// Mirrors the `email_connection_security_enum` Postgres enum.
#[derive(sqlx::Type, Debug, Clone, Copy, PartialEq, Eq)]
#[sqlx(
    type_name = "email_connection_security_enum",
    rename_all = "SCREAMING_SNAKE_CASE"
)]
pub enum DbConnectionSecurity {
    SslTls,
    Starttls,
}

impl From<ConnectionSecurity> for DbConnectionSecurity {
    fn from(value: ConnectionSecurity) -> Self {
        match value {
            ConnectionSecurity::SslTls => DbConnectionSecurity::SslTls,
            ConnectionSecurity::Starttls => DbConnectionSecurity::Starttls,
        }
    }
}

impl From<DbConnectionSecurity> for ConnectionSecurity {
    fn from(value: DbConnectionSecurity) -> Self {
        match value {
            DbConnectionSecurity::SslTls => ConnectionSecurity::SslTls,
            DbConnectionSecurity::Starttls => ConnectionSecurity::Starttls,
        }
    }
}

/// Row in `email_imap_smtp_credentials`. Passwords are ciphertext.
#[derive(Debug, Clone)]
pub struct DbImapSmtpCredentials {
    pub link_id: Uuid,
    pub imap_host: String,
    pub imap_port: i32,
    pub imap_security: DbConnectionSecurity,
    pub imap_username: String,
    pub imap_password_ciphertext: Vec<u8>,
    pub smtp_host: String,
    pub smtp_port: i32,
    pub smtp_security: DbConnectionSecurity,
    pub smtp_username: String,
    pub smtp_password_ciphertext: Vec<u8>,
}

/// Row in `email_imap_folder_states`.
#[derive(Debug, Clone)]
pub struct DbImapFolderState {
    pub link_id: Uuid,
    pub folder: String,
    pub uid_validity: i64,
    pub last_seen_uid: i64,
}

/// Inserts or replaces the IMAP/SMTP connection settings for a link.
#[tracing::instrument(skip(executor, credentials), fields(link_id = %credentials.link_id), err)]
pub async fn upsert_credentials<'e, E>(
    executor: E,
    credentials: &DbImapSmtpCredentials,
) -> anyhow::Result<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    sqlx::query!(
        r#"
        INSERT INTO email_imap_smtp_credentials (
            link_id,
            imap_host, imap_port, imap_security, imap_username, imap_password_ciphertext,
            smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_ciphertext,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (link_id)
        DO UPDATE SET
            imap_host = EXCLUDED.imap_host,
            imap_port = EXCLUDED.imap_port,
            imap_security = EXCLUDED.imap_security,
            imap_username = EXCLUDED.imap_username,
            imap_password_ciphertext = EXCLUDED.imap_password_ciphertext,
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_security = EXCLUDED.smtp_security,
            smtp_username = EXCLUDED.smtp_username,
            smtp_password_ciphertext = EXCLUDED.smtp_password_ciphertext,
            updated_at = NOW()
        "#,
        credentials.link_id,
        credentials.imap_host,
        credentials.imap_port,
        credentials.imap_security as _,
        credentials.imap_username,
        credentials.imap_password_ciphertext,
        credentials.smtp_host,
        credentials.smtp_port,
        credentials.smtp_security as _,
        credentials.smtp_username,
        credentials.smtp_password_ciphertext,
    )
    .execute(executor)
    .await?;

    Ok(())
}

/// Fetches the IMAP/SMTP connection settings for a link, if any.
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_credentials_by_link_id(
    pool: &PgPool,
    link_id: Uuid,
) -> anyhow::Result<Option<DbImapSmtpCredentials>> {
    let row = sqlx::query_as!(
        DbImapSmtpCredentials,
        r#"
        SELECT link_id,
               imap_host, imap_port, imap_security as "imap_security: _",
               imap_username, imap_password_ciphertext,
               smtp_host, smtp_port, smtp_security as "smtp_security: _",
               smtp_username, smtp_password_ciphertext
        FROM email_imap_smtp_credentials
        WHERE link_id = $1
        "#,
        link_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Fetches all per-folder sync states for a link.
#[tracing::instrument(skip(pool), err)]
pub async fn fetch_folder_states(
    pool: &PgPool,
    link_id: Uuid,
) -> anyhow::Result<Vec<DbImapFolderState>> {
    let rows = sqlx::query_as!(
        DbImapFolderState,
        r#"
        SELECT link_id, folder, uid_validity, last_seen_uid
        FROM email_imap_folder_states
        WHERE link_id = $1
        "#,
        link_id
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Inserts or updates the sync state for one folder of a link.
#[tracing::instrument(skip(executor), err)]
pub async fn upsert_folder_state<'e, E>(
    executor: E,
    link_id: Uuid,
    folder: &str,
    uid_validity: i64,
    last_seen_uid: i64,
) -> anyhow::Result<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    sqlx::query!(
        r#"
        INSERT INTO email_imap_folder_states (link_id, folder, uid_validity, last_seen_uid, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (link_id, folder)
        DO UPDATE SET
            uid_validity = EXCLUDED.uid_validity,
            last_seen_uid = EXCLUDED.last_seen_uid,
            updated_at = NOW()
        "#,
        link_id,
        folder,
        uid_validity,
        last_seen_uid,
    )
    .execute(executor)
    .await?;

    Ok(())
}
