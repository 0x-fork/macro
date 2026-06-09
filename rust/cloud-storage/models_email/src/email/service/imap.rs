//! Connection settings for IMAP/SMTP ("bring your own server") email links.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// How a connection to an IMAP/SMTP server is secured.
///
/// Mirrors the `email_connection_security_enum` Postgres enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectionSecurity {
    /// Implicit TLS from the first byte (IMAPS port 993 / SMTPS port 465).
    SslTls,
    /// Plaintext connection upgraded via STARTTLS (commonly SMTP port 587).
    Starttls,
}

impl ConnectionSecurity {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnectionSecurity::SslTls => "SSL_TLS",
            ConnectionSecurity::Starttls => "STARTTLS",
        }
    }
}

/// Settings for connecting to a single mail server (one half of an
/// IMAP/SMTP pair). The password is held in plaintext in memory only; it is
/// encrypted before being persisted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
    pub security: ConnectionSecurity,
    pub username: String,
    pub password: String,
}

/// Decrypted IMAP + SMTP connection settings for an `IMAP_SMTP` email link.
#[derive(Debug, Clone)]
pub struct ImapSmtpCredentials {
    pub link_id: Uuid,
    pub imap: ServerSettings,
    pub smtp: ServerSettings,
}

/// Per-folder incremental sync state for an IMAP link, the IMAP analogue of a
/// Gmail history id. `last_seen_uid` is the highest UID already ingested for
/// the folder under the recorded `uid_validity`.
#[derive(Debug, Clone)]
pub struct ImapFolderState {
    pub link_id: Uuid,
    pub folder: String,
    pub uid_validity: i64,
    pub last_seen_uid: i64,
}
