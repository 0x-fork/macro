//! Helpers for working with IMAP/SMTP link credentials.

use anyhow::Context;
use email_db_client::imap::DbImapSmtpCredentials;
use email_utils::credential_crypto::CredentialKey;
use models_email::service::imap::{ImapSmtpCredentials, ServerSettings};
use sqlx::PgPool;
use uuid::Uuid;

/// Parses the configured credential encryption key. Returns `None` when the
/// key is unset (IMAP/SMTP links disabled for this deployment).
pub fn parse_credential_key(raw: &str) -> anyhow::Result<Option<CredentialKey>> {
    if raw.trim().is_empty() {
        return Ok(None);
    }
    CredentialKey::from_base64(raw).map(Some)
}

/// Returns the credential key or a clear error when IMAP/SMTP support isn't
/// configured for this deployment.
pub fn require_credential_key(key: &Option<CredentialKey>) -> anyhow::Result<&CredentialKey> {
    key.as_ref().context(
        "EMAIL_CREDENTIALS_ENCRYPTION_KEY is not configured; IMAP/SMTP links are unavailable",
    )
}

/// Fetches and decrypts the IMAP/SMTP connection settings for a link.
#[tracing::instrument(skip(db, key), err)]
pub async fn fetch_credentials(
    db: &PgPool,
    key: &CredentialKey,
    link_id: Uuid,
) -> anyhow::Result<ImapSmtpCredentials> {
    let row = email_db_client::imap::fetch_credentials_by_link_id(db, link_id)
        .await?
        .with_context(|| format!("no IMAP/SMTP credentials stored for link {link_id}"))?;

    decrypt_credentials(key, row)
}

fn decrypt_credentials(
    key: &CredentialKey,
    row: DbImapSmtpCredentials,
) -> anyhow::Result<ImapSmtpCredentials> {
    Ok(ImapSmtpCredentials {
        link_id: row.link_id,
        imap: ServerSettings {
            host: row.imap_host,
            port: u16::try_from(row.imap_port).context("stored IMAP port out of range")?,
            security: row.imap_security.into(),
            username: row.imap_username,
            password: key
                .decrypt(&row.imap_password_ciphertext)
                .context("failed to decrypt IMAP password")?,
        },
        smtp: ServerSettings {
            host: row.smtp_host,
            port: u16::try_from(row.smtp_port).context("stored SMTP port out of range")?,
            security: row.smtp_security.into(),
            username: row.smtp_username,
            password: key
                .decrypt(&row.smtp_password_ciphertext)
                .context("failed to decrypt SMTP password")?,
        },
    })
}

/// Encrypts plaintext server settings into a row ready for persistence.
pub fn encrypt_credentials(
    key: &CredentialKey,
    link_id: Uuid,
    imap: &ServerSettings,
    smtp: &ServerSettings,
) -> anyhow::Result<DbImapSmtpCredentials> {
    Ok(DbImapSmtpCredentials {
        link_id,
        imap_host: imap.host.clone(),
        imap_port: i32::from(imap.port),
        imap_security: imap.security.into(),
        imap_username: imap.username.clone(),
        imap_password_ciphertext: key
            .encrypt(&imap.password)
            .context("failed to encrypt IMAP password")?,
        smtp_host: smtp.host.clone(),
        smtp_port: i32::from(smtp.port),
        smtp_security: smtp.security.into(),
        smtp_username: smtp.username.clone(),
        smtp_password_ciphertext: key
            .encrypt(&smtp.password)
            .context("failed to encrypt SMTP password")?,
    })
}
