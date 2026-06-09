//! IMAP side of the client: folder status, incremental UID fetches, appends
//! and flag updates.

use anyhow::Context;
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use models_email::service::imap::{ConnectionSecurity, ServerSettings};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;

use crate::tls::connect_tls;

/// Folder names commonly used for sent mail, tried in order when the server
/// doesn't advertise a `\Sent` special-use mailbox.
const SENT_FOLDER_CANDIDATES: &[&str] = &[
    "Sent",
    "Sent Items",
    "Sent Messages",
    "INBOX.Sent",
    "[Gmail]/Sent Mail",
];

/// UIDVALIDITY + UIDNEXT snapshot of a folder, used to drive incremental sync.
#[derive(Debug, Clone, Copy)]
pub struct FolderStatus {
    /// The folder's UIDVALIDITY. If this changes between polls all stored
    /// UIDs for the folder are invalid and the folder must be re-synced.
    pub uid_validity: u32,
    /// The next UID the server will assign; all existing messages have UIDs
    /// strictly below this.
    pub uid_next: u32,
    /// Number of messages currently in the folder.
    pub exists: u32,
}

/// A raw message fetched from an IMAP folder.
#[derive(Debug, Clone)]
pub struct FetchedMessage {
    /// The message's UID within its folder (under the current UIDVALIDITY).
    pub uid: u32,
    /// Whether the `\Seen` flag is set.
    pub seen: bool,
    /// Whether the `\Flagged` (starred) flag is set.
    pub flagged: bool,
    /// Whether the `\Draft` flag is set.
    pub draft: bool,
    /// The server's INTERNALDATE for the message.
    pub internal_date: Option<DateTime<Utc>>,
    /// The full RFC 5322 message bytes.
    pub body: Vec<u8>,
}

/// An authenticated IMAP session.
pub struct ImapSession {
    inner: async_imap::Session<TlsStream<TcpStream>>,
}

impl ImapSession {
    /// Connects and logs in to an IMAP server, either over implicit TLS
    /// (typically port 993) or a plaintext connection upgraded with STARTTLS
    /// (typically port 143).
    #[tracing::instrument(skip(settings), fields(host = %settings.host, port = settings.port), err)]
    pub async fn connect(settings: &ServerSettings) -> anyhow::Result<Self> {
        let client = match settings.security {
            ConnectionSecurity::SslTls => {
                let tls_stream = connect_tls(&settings.host, settings.port).await?;
                let mut client = async_imap::Client::new(tls_stream);
                read_greeting(&mut client, settings).await?;
                client
            }
            ConnectionSecurity::Starttls => {
                let tcp = tokio::net::TcpStream::connect((settings.host.as_str(), settings.port))
                    .await
                    .with_context(|| {
                        format!("failed to connect to {}:{}", settings.host, settings.port)
                    })?;
                let mut plain_client = async_imap::Client::new(tcp);
                read_greeting(&mut plain_client, settings).await?;
                plain_client
                    .run_command_and_check_ok("STARTTLS", None)
                    .await
                    .with_context(|| {
                        format!(
                            "IMAP server {}:{} rejected STARTTLS",
                            settings.host, settings.port
                        )
                    })?;
                let tls_stream =
                    crate::tls::upgrade_tls(plain_client.into_inner(), &settings.host).await?;
                // No greeting is sent after a STARTTLS upgrade.
                async_imap::Client::new(tls_stream)
            }
        };

        let inner = client
            .login(&settings.username, &settings.password)
            .await
            .map_err(|(e, _client)| {
                anyhow::Error::new(e).context(format!(
                    "IMAP login to {}:{} failed; check the username and password (many providers require an app password)",
                    settings.host, settings.port
                ))
            })?;

        Ok(Self { inner })
    }

    /// Connects, authenticates and immediately logs out. Used to validate
    /// user-supplied settings before persisting them.
    pub async fn verify(settings: &ServerSettings) -> anyhow::Result<()> {
        let mut session = Self::connect(settings).await?;
        session.logout().await;
        Ok(())
    }

    /// Opens a folder read-only (EXAMINE) and returns its sync status.
    #[tracing::instrument(skip(self), err)]
    pub async fn examine_folder(&mut self, folder: &str) -> anyhow::Result<FolderStatus> {
        let mailbox = self
            .inner
            .examine(folder)
            .await
            .with_context(|| format!("failed to EXAMINE IMAP folder {folder}"))?;

        Ok(FolderStatus {
            uid_validity: mailbox
                .uid_validity
                .context("IMAP server did not report UIDVALIDITY")?,
            uid_next: mailbox
                .uid_next
                .context("IMAP server did not report UIDNEXT")?,
            exists: mailbox.exists,
        })
    }

    /// Fetches messages in the currently examined folder with UIDs strictly
    /// greater than `last_seen_uid`, oldest first, capped at `limit`.
    ///
    /// When more than `limit` messages are pending the *oldest* are returned,
    /// so a caller advancing its high-water mark to the last returned UID
    /// picks up the remainder on the next poll.
    ///
    /// Bodies are fetched with `BODY.PEEK[]` so the server doesn't mark
    /// unread messages as seen.
    #[tracing::instrument(skip(self), err)]
    pub async fn fetch_messages_after_uid(
        &mut self,
        last_seen_uid: u32,
        limit: usize,
    ) -> anyhow::Result<Vec<FetchedMessage>> {
        // `N:*` always matches the highest-UID message even when N exceeds it,
        // so messages at or below last_seen_uid are filtered out below.
        let range = format!("{}:*", last_seen_uid.saturating_add(1));
        let mut messages = self.uid_fetch_range(&range).await?;
        messages.retain(|m| m.uid > last_seen_uid);
        messages.sort_by_key(|m| m.uid);
        messages.truncate(limit);
        Ok(messages)
    }

    /// Fetches the `count` most recent messages (by UID order) in the
    /// currently examined folder. Used for the initial seed of a folder.
    #[tracing::instrument(skip(self), err)]
    pub async fn fetch_recent_messages(
        &mut self,
        status: &FolderStatus,
        count: u32,
    ) -> anyhow::Result<Vec<FetchedMessage>> {
        if status.exists == 0 {
            return Ok(Vec::new());
        }

        // Sequence numbers are contiguous (1..=exists), so the last `count`
        // sequence numbers are the most recent messages.
        let start = status.exists.saturating_sub(count - 1).max(1);
        let range = format!("{}:{}", start, status.exists);
        self.fetch_range(&range).await
    }

    async fn uid_fetch_range(&mut self, range: &str) -> anyhow::Result<Vec<FetchedMessage>> {
        let stream = self
            .inner
            .uid_fetch(range, "(UID FLAGS INTERNALDATE BODY.PEEK[])")
            .await
            .with_context(|| format!("IMAP UID FETCH {range} failed"))?;

        let fetches: Vec<async_imap::types::Fetch> = stream
            .try_collect()
            .await
            .with_context(|| format!("failed reading IMAP UID FETCH {range} response"))?;

        Ok(fetches.iter().filter_map(to_fetched_message).collect())
    }

    async fn fetch_range(&mut self, range: &str) -> anyhow::Result<Vec<FetchedMessage>> {
        let stream = self
            .inner
            .fetch(range, "(UID FLAGS INTERNALDATE BODY.PEEK[])")
            .await
            .with_context(|| format!("IMAP FETCH {range} failed"))?;

        let fetches: Vec<async_imap::types::Fetch> = stream
            .try_collect()
            .await
            .with_context(|| format!("failed reading IMAP FETCH {range} response"))?;

        Ok(fetches.iter().filter_map(to_fetched_message).collect())
    }

    /// Finds the folder where sent mail is stored: prefers a mailbox
    /// advertising the `\Sent` special-use attribute, then falls back to
    /// common names. Returns `None` if nothing matches.
    #[tracing::instrument(skip(self), err)]
    pub async fn find_sent_folder(&mut self) -> anyhow::Result<Option<String>> {
        let names: Vec<async_imap::types::Name> = self
            .inner
            .list(Some(""), Some("*"))
            .await
            .context("IMAP LIST failed")?
            .try_collect()
            .await
            .context("failed reading IMAP LIST response")?;

        for name in &names {
            let is_sent = name
                .attributes()
                .iter()
                .any(|attr| format!("{attr:?}").contains("Sent"));
            if is_sent {
                return Ok(Some(name.name().to_string()));
            }
        }

        for candidate in SENT_FOLDER_CANDIDATES {
            if names.iter().any(|n| n.name() == *candidate) {
                return Ok(Some(candidate.to_string()));
            }
        }

        Ok(None)
    }

    /// Appends a raw RFC 5322 message to a folder with the `\Seen` flag,
    /// used to file a copy of an outgoing message into the sent folder.
    #[tracing::instrument(skip(self, body), err)]
    pub async fn append_seen(&mut self, folder: &str, body: &[u8]) -> anyhow::Result<()> {
        self.inner
            .append(folder, Some("(\\Seen)"), None, body)
            .await
            .with_context(|| format!("failed to APPEND message to IMAP folder {folder}"))?;
        Ok(())
    }

    /// Sets or clears the `\Seen` flag on the message with the given
    /// `Message-ID` header in `folder`. Returns `false` if no message with
    /// that Message-ID exists in the folder.
    ///
    /// The folder is opened with SELECT (read-write) for the STORE.
    #[tracing::instrument(skip(self), err)]
    pub async fn set_seen_by_message_id(
        &mut self,
        folder: &str,
        message_id: &str,
        seen: bool,
    ) -> anyhow::Result<bool> {
        self.inner
            .select(folder)
            .await
            .with_context(|| format!("failed to SELECT IMAP folder {folder}"))?;

        // Search expects the Message-ID without angle brackets.
        let needle = message_id.trim_matches(|c| c == '<' || c == '>');
        let uids = self
            .inner
            .uid_search(format!("HEADER Message-ID {needle}"))
            .await
            .context("IMAP UID SEARCH by Message-ID failed")?;

        let Some(uid) = uids.into_iter().next() else {
            return Ok(false);
        };

        let op = if seen { "+FLAGS" } else { "-FLAGS" };
        let updates: Vec<async_imap::types::Fetch> = self
            .inner
            .uid_store(format!("{uid}"), format!("{op} (\\Seen)"))
            .await
            .context("IMAP UID STORE failed")?
            .try_collect()
            .await
            .context("failed reading IMAP UID STORE response")?;
        drop(updates);

        Ok(true)
    }

    /// Logs out, best-effort.
    pub async fn logout(&mut self) {
        if let Err(e) = self.inner.logout().await {
            tracing::debug!(error = ?e, "IMAP logout failed");
        }
    }
}

/// Consumes the server greeting that IMAP servers send immediately after the
/// connection is established.
async fn read_greeting<T>(
    client: &mut async_imap::Client<T>,
    settings: &ServerSettings,
) -> anyhow::Result<()>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    client
        .read_response()
        .await
        .with_context(|| {
            format!(
                "failed reading greeting from IMAP server {}:{}",
                settings.host, settings.port
            )
        })?
        .with_context(|| {
            format!(
                "IMAP server {}:{} closed the connection before sending a greeting",
                settings.host, settings.port
            )
        })?;
    Ok(())
}

fn to_fetched_message(fetch: &async_imap::types::Fetch) -> Option<FetchedMessage> {
    let uid = fetch.uid?;
    let body = fetch.body()?.to_vec();

    let mut seen = false;
    let mut flagged = false;
    let mut draft = false;
    for flag in fetch.flags() {
        match flag {
            async_imap::types::Flag::Seen => seen = true,
            async_imap::types::Flag::Flagged => flagged = true,
            async_imap::types::Flag::Draft => draft = true,
            _ => {}
        }
    }

    Some(FetchedMessage {
        uid,
        seen,
        flagged,
        draft,
        internal_date: fetch.internal_date().map(|d| d.with_timezone(&Utc)),
        body,
    })
}
