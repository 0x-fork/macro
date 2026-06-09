//! Client for connecting to arbitrary email servers over IMAP (receive) and
//! SMTP (send).
//!
//! This is the non-Gmail counterpart of `gmail_client`: where Gmail links use
//! the Gmail REST API with OAuth tokens, `IMAP_SMTP` links talk the standard
//! mail protocols directly using a username + password. Connections are
//! TLS-protected (implicit TLS for IMAP; implicit TLS or STARTTLS for SMTP).

#![deny(missing_docs)]

pub mod imap;
pub mod smtp;
mod tls;

pub use imap::{FetchedMessage, FolderStatus, ImapSession};
