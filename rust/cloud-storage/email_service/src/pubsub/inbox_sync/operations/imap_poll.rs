//! Polls an IMAP server for new messages on an `IMAP_SMTP` link.
//!
//! IMAP has no push channel into our infrastructure (no Pub/Sub webhook like
//! Gmail), so syncing is poll-driven: the link-manager refresh schedule and
//! manual resyncs enqueue `ImapPoll` operations on the inbox sync queue. Each
//! poll EXAMINEs the inbox and sent folders and ingests messages with UIDs
//! above the per-folder high-water mark in `email_imap_folder_states`. A
//! UIDVALIDITY change (or a first poll) seeds the folder with a window of the
//! most recent messages instead.

use crate::convert::imap::{MappedImapMessage, map_imap_message_to_service};
use crate::pubsub::context::PubSubContext;
use crate::pubsub::inbox_sync::operations::shared::notify_search;
use crate::pubsub::inbox_sync::operations::upsert_message::{
    handle_contacts_sync, send_notifications,
};
use crate::pubsub::util::cg_refresh_email;
use crate::pubsub::util::{CrmContactRecipient, enqueue_populate_crm_contacts};
use crate::util::process_pre_insert::process_message_pre_insert;
use anyhow::Context;
use email_utils::dedupe_emails;
use imap_smtp_client::{FolderStatus, ImapSession};
use models_email::email::service;
use models_email::email::service::message::{is_inbound, is_outbound, is_spam_or_trash};
use models_email::gmail::inbox_sync::ImapPollPayload;
use models_email::gmail::labels::SystemLabelID;
use models_email::service::imap::ImapSmtpCredentials;
use models_email::service::link;
use models_email::service::pubsub::{DetailedError, FailureReason, ProcessingError};
use std::collections::HashMap;
use std::result;

/// How many recent messages to ingest per folder when seeding a folder for
/// the first time (or after a UIDVALIDITY change).
const INITIAL_SEED_MESSAGES: u32 = 50;

/// Cap on messages ingested per folder per poll. Older messages are processed
/// first and the high-water mark advances with them, so anything beyond the
/// cap is picked up by the next poll.
const MAX_MESSAGES_PER_POLL: usize = 200;

/// System labels referenced by mapped IMAP messages. These rows must exist in
/// `email_labels` before messages can link to them.
const SYSTEM_LABELS: &[SystemLabelID] = &[
    SystemLabelID::Inbox,
    SystemLabelID::Sent,
    SystemLabelID::Unread,
    SystemLabelID::Starred,
    SystemLabelID::Draft,
];

/// Polls the link's IMAP server and ingests new messages.
#[tracing::instrument(skip(ctx, link, payload), fields(link_id = %link.id))]
pub async fn imap_poll(
    ctx: &PubSubContext,
    link: &link::Link,
    payload: &ImapPollPayload,
) -> result::Result<(), ProcessingError> {
    let credentials = fetch_link_credentials(ctx, link).await?;

    ensure_system_labels(ctx, link).await?;

    let mut session = ImapSession::connect(&credentials.imap).await.map_err(|e| {
        ProcessingError::Retryable(DetailedError {
            reason: FailureReason::InvalidData,
            source: e.context("failed to connect to IMAP server"),
        })
    })?;

    tracing::debug!(initial = payload.initial, "starting IMAP poll");

    let result = poll_folders(ctx, link, &mut session).await;

    session.logout().await;

    let ingested_any = result?;

    if ingested_any {
        // trigger FE inbox refresh
        cg_refresh_email(
            &ctx.connection_gateway_client,
            link.macro_id.as_ref(),
            "imap_poll",
        )
        .await;
    }

    Ok(())
}

/// Syncs the inbox and (if found) sent folder. Returns whether any message
/// was ingested.
async fn poll_folders(
    ctx: &PubSubContext,
    link: &link::Link,
    session: &mut ImapSession,
) -> result::Result<bool, ProcessingError> {
    let sent_folder = session.find_sent_folder().await.unwrap_or_else(|e| {
        tracing::warn!(error = ?e, "failed to detect IMAP sent folder; syncing inbox only");
        None
    });

    let mut folders: Vec<(String, bool)> = vec![("INBOX".to_string(), false)];
    if let Some(sent) = sent_folder {
        folders.push((sent, true));
    }

    let folder_states: HashMap<String, (i64, i64)> =
        email_db_client::imap::fetch_folder_states(&ctx.db, link.id)
            .await
            .map_err(|e| db_retryable(e.context("failed to fetch IMAP folder states")))?
            .into_iter()
            .map(|s| (s.folder, (s.uid_validity, s.last_seen_uid)))
            .collect();

    let mut ingested_any = false;

    for (folder, is_sent_folder) in folders {
        match poll_one_folder(
            ctx,
            link,
            session,
            &folder,
            is_sent_folder,
            folder_states.get(&folder).copied(),
        )
        .await
        {
            Ok(ingested) => ingested_any |= ingested,
            Err(e) => {
                // Keep syncing the remaining folders; the folder's high-water
                // mark wasn't advanced so the next poll retries it.
                tracing::error!(error = ?e, folder = %folder, link_id = %link.id, "failed to sync IMAP folder");
            }
        }
    }

    Ok(ingested_any)
}

/// Syncs a single folder. Returns whether any message was ingested.
#[tracing::instrument(skip(ctx, link, session, stored_state), err)]
async fn poll_one_folder(
    ctx: &PubSubContext,
    link: &link::Link,
    session: &mut ImapSession,
    folder: &str,
    is_sent_folder: bool,
    stored_state: Option<(i64, i64)>,
) -> anyhow::Result<bool> {
    let status = session.examine_folder(folder).await?;

    let incremental_from = match stored_state {
        Some((uid_validity, last_seen_uid)) if uid_validity == i64::from(status.uid_validity) => {
            Some(last_seen_uid)
        }
        Some(_) => {
            tracing::info!(folder, link_id = %link.id, "IMAP UIDVALIDITY changed; re-seeding folder");
            None
        }
        None => None,
    };

    let (messages, new_last_seen_uid) = match incremental_from {
        Some(last_seen_uid) => {
            let last_seen = u32::try_from(last_seen_uid).unwrap_or(0);
            let messages = session
                .fetch_messages_after_uid(last_seen, MAX_MESSAGES_PER_POLL)
                .await?;
            let max_uid = messages
                .iter()
                .map(|m| i64::from(m.uid))
                .max()
                .unwrap_or(last_seen_uid);
            (messages, max_uid)
        }
        None => {
            let messages = session
                .fetch_recent_messages(&status, INITIAL_SEED_MESSAGES)
                .await?;
            // Everything below UIDNEXT is either ingested by this seed or
            // intentionally outside the seed window.
            (messages, seed_high_water_mark(&status))
        }
    };

    let mut ingested = false;
    let mut messages = messages;
    messages.sort_by_key(|m| m.uid);

    for fetched in &messages {
        let mapped = match map_imap_message_to_service(
            fetched,
            link.id,
            folder,
            status.uid_validity,
            is_sent_folder,
        ) {
            Ok(mapped) => mapped,
            Err(e) => {
                tracing::warn!(error = ?e, folder, uid = fetched.uid, "skipping unparsable IMAP message");
                continue;
            }
        };

        match ingest_message(ctx, link, mapped).await {
            Ok(was_new) => ingested |= was_new,
            Err(e) => {
                tracing::error!(error = ?e, folder, uid = fetched.uid, "failed to ingest IMAP message");
            }
        }
    }

    email_db_client::imap::upsert_folder_state(
        &ctx.db,
        link.id,
        folder,
        i64::from(status.uid_validity),
        new_last_seen_uid,
    )
    .await
    .context("failed to update IMAP folder state")?;

    Ok(ingested)
}

fn seed_high_water_mark(status: &FolderStatus) -> i64 {
    i64::from(status.uid_next.saturating_sub(1))
}

/// Inserts one mapped message, resolving its thread by the References chain.
/// Returns `true` when the message was new.
async fn ingest_message(
    ctx: &PubSubContext,
    link: &link::Link,
    mapped: MappedImapMessage,
) -> anyhow::Result<bool> {
    let MappedImapMessage {
        mut message,
        ancestor_global_ids,
    } = mapped;

    let global_id = message
        .global_id
        .clone()
        .expect("mapped IMAP messages always have a global_id");

    if email_db_client::messages::get::message_exists_by_provider_id(&ctx.db, &global_id, link.id)
        .await?
    {
        return Ok(false);
    }

    // The thread's provider id is the root of the References chain (or the
    // message's own id for a fresh thread), so replies land in one thread.
    let thread_provider_id = ancestor_global_ids
        .first()
        .cloned()
        .unwrap_or_else(|| global_id.clone());
    message.provider_thread_id = Some(thread_provider_id.clone());

    let mut lookup_ids = ancestor_global_ids;
    lookup_ids.push(global_id.clone());
    let existing_thread =
        email_db_client::messages::get::get_thread_id_by_global_ids(&ctx.db, link.id, &lookup_ids)
            .await?;

    process_message_pre_insert(&mut message).await;

    let is_sent = message.is_sent;
    let spam_or_trash = is_spam_or_trash(&message);
    let message_db_id = message.db_id;
    let sender_email = message
        .from
        .as_ref()
        .map(|from| from.email.clone())
        .filter(|e| !email_utils::is_generic_email(e));
    let recipient_emails = dedupe_emails(
        message
            .to
            .iter()
            .chain(&message.cc)
            .chain(&message.bcc)
            .map(|c| c.email.clone())
            .collect(),
    )
    .into_iter()
    .filter(|e| !email_utils::is_generic_email(e))
    .collect::<Vec<_>>();

    // Mirrors upsert_message's CRM fan-out: sent → to/cc/bcc, received →
    // from, drafts skipped.
    let at = message.internal_date_ts.unwrap_or_else(chrono::Utc::now);
    let crm_recipients: Vec<CrmContactRecipient> = if message.is_draft {
        Vec::new()
    } else if is_sent {
        message
            .to
            .iter()
            .chain(&message.cc)
            .chain(&message.bcc)
            .map(|c| (c.email.clone(), c.name.clone(), at, at))
            .collect()
    } else {
        message
            .from
            .iter()
            .map(|c| (c.email.clone(), c.name.clone(), at, at))
            .collect()
    };

    match existing_thread {
        Some(thread_db_id) => {
            email_db_client::messages::insert::insert_message(
                &ctx.db,
                thread_db_id,
                &mut message,
                link.id,
                true,
            )
            .await
            .context("failed to insert IMAP message into existing thread")?;
        }
        None => {
            let thread = build_thread_for_message(message, link.id, thread_provider_id);
            email_db_client::threads::insert::insert_thread_and_messages(&ctx.db, thread, link.id)
                .await
                .context("failed to insert thread for IMAP message")?;
        }
    }

    if let Err(e) = notify_search(ctx, link, message_db_id, spam_or_trash).await {
        tracing::error!(error = ?e, "failed to notify search of new IMAP message");
    }

    if let Err(e) = handle_contacts_sync(
        ctx,
        link,
        &recipient_emails,
        sender_email.as_deref(),
        is_sent,
    )
    .await
    {
        tracing::error!(error = ?e, "failed to enqueue contacts sync for IMAP message");
    }

    if !crm_recipients.is_empty() {
        let self_email = link.email_address.0.as_ref().to_ascii_lowercase();
        if let Err(e) =
            enqueue_populate_crm_contacts(ctx, link.id, &self_email, crm_recipients, is_sent).await
        {
            tracing::error!(error = ?e, "failed to enqueue CRM contacts for IMAP message");
        }
    }

    if !is_sent {
        if let Err(e) = send_notifications(ctx, link, &global_id).await {
            tracing::error!(error = ?e, "failed to send notification for new IMAP message");
        }
    }

    Ok(true)
}

/// Builds a single-message thread, mirroring the Gmail thread mapper's
/// derived fields.
fn build_thread_for_message(
    message: service::message::Message,
    link_id: uuid::Uuid,
    thread_provider_id: String,
) -> service::thread::Thread {
    let inbox_visible = message
        .labels
        .iter()
        .any(|label| label.provider_label_id == SystemLabelID::Inbox.as_str());

    service::thread::Thread {
        db_id: message.thread_db_id,
        provider_id: Some(thread_provider_id),
        link_id,
        inbox_visible,
        is_read: message.is_read,
        latest_inbound_message_ts: is_inbound(&message)
            .then_some(message.internal_date_ts)
            .flatten(),
        latest_outbound_message_ts: is_outbound(&message)
            .then_some(message.internal_date_ts)
            .flatten(),
        latest_non_spam_message_ts: (!is_spam_or_trash(&message))
            .then_some(message.internal_date_ts)
            .flatten(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        messages: vec![message],
    }
}

/// Fetches and decrypts the link's stored IMAP/SMTP credentials.
async fn fetch_link_credentials(
    ctx: &PubSubContext,
    link: &link::Link,
) -> result::Result<ImapSmtpCredentials, ProcessingError> {
    let key = crate::util::imap::require_credential_key(&ctx.credential_key).map_err(|e| {
        ProcessingError::NonRetryable(DetailedError {
            reason: FailureReason::InvalidData,
            source: e,
        })
    })?;

    crate::util::imap::fetch_credentials(&ctx.db, key, link.id)
        .await
        .map_err(|e| {
            ProcessingError::NonRetryable(DetailedError {
                reason: FailureReason::InvalidData,
                source: e.context("failed to load IMAP/SMTP credentials"),
            })
        })
}

/// Upserts the Gmail-compatible system label rows messages link against.
async fn ensure_system_labels(
    ctx: &PubSubContext,
    link: &link::Link,
) -> result::Result<(), ProcessingError> {
    let labels: Vec<service::label::Label> = SYSTEM_LABELS
        .iter()
        .map(|id| service::label::Label {
            id: None,
            link_id: link.id,
            provider_label_id: id.as_str().to_string(),
            name: Some(id.as_str().to_string()),
            created_at: Default::default(),
            message_list_visibility: None,
            label_list_visibility: None,
            type_: Some(service::label::LabelType::System),
        })
        .collect();

    email_db_client::labels::insert::insert_or_update_labels(&ctx.db, labels)
        .await
        .map_err(|e| db_retryable(e.context("failed to upsert IMAP system labels")))
}

fn db_retryable(e: anyhow::Error) -> ProcessingError {
    ProcessingError::Retryable(DetailedError {
        reason: FailureReason::DatabaseQueryFailed,
        source: e,
    })
}
