use chrono::{DateTime, Utc};
use macro_user_id::{email::EmailStr, user_id::MacroUserIdStr};
use uuid::Uuid;

/// The provider of this email
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UserProvider {
    Gmail,
    /// A generic email server reached over IMAP (receive) and SMTP (send).
    ImapSmtp,
}

impl UserProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserProvider::Gmail => "GMAIL",
            UserProvider::ImapSmtp => "IMAP_SMTP",
        }
    }
}

#[derive(Clone)]
pub struct Link {
    pub id: Uuid,
    pub macro_id: MacroUserIdStr<'static>,
    pub fusionauth_user_id: String,
    pub email_address: EmailStr<'static>,
    pub provider: UserProvider,
    pub is_sync_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
