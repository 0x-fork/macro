//! Pushes label changes for `IMAP_SMTP` links to the IMAP server.
//!
//! IMAP has no label concept; the only change we mirror is read state, which
//! maps to the `\Seen` flag. Other label changes (starring aside, which IMAP
//! could express but we don't push yet) stay local to our database.

use crate::pubsub::gmail_ops::worker::GmailOpsContext;
use crate::util::imap::{fetch_credentials, require_credential_key};
use imap_smtp_client::ImapSession;
use models_email::gmail::gmail_ops::ModifyMessageLabelsPayload;
use models_email::gmail::labels::SystemLabelID;
use models_email::service::link::Link;
use models_email::service::pubsub::{DetailedError, FailureReason, ProcessingError};

/// Folders we search for the message when mirroring a flag change.
const FLAG_TARGET_FOLDERS: &[&str] = &["INBOX"];

/// Mirrors a label modification onto the IMAP server where possible.
#[tracing::instrument(skip(ctx, link), err)]
pub async fn imap_modify_message_labels(
    ctx: &GmailOpsContext,
    link: &Link,
    payload: &ModifyMessageLabelsPayload,
) -> Result<(), ProcessingError> {
    let unread = SystemLabelID::Unread.as_str();
    let marks_read = payload.labels_to_remove.iter().any(|l| l == unread);
    let marks_unread = payload.labels_to_add.iter().any(|l| l == unread);

    if !marks_read && !marks_unread {
        tracing::debug!(
            provider_message_id = %payload.provider_message_id,
            "label change has no IMAP equivalent; keeping it local"
        );
        return Ok(());
    }

    let key = require_credential_key(&ctx.credential_key).map_err(|e| {
        ProcessingError::NonRetryable(DetailedError {
            reason: FailureReason::InvalidData,
            source: e,
        })
    })?;

    let credentials = fetch_credentials(&ctx.db, key, link.id)
        .await
        .map_err(|e| {
            ProcessingError::NonRetryable(DetailedError {
                reason: FailureReason::InvalidData,
                source: e.context("failed to load IMAP/SMTP credentials"),
            })
        })?;

    let mut session = ImapSession::connect(&credentials.imap).await.map_err(|e| {
        ProcessingError::Retryable(DetailedError {
            reason: FailureReason::InvalidData,
            source: e.context("failed to connect to IMAP server"),
        })
    })?;

    let mut found = false;
    for folder in FLAG_TARGET_FOLDERS {
        match session
            .set_seen_by_message_id(folder, &payload.provider_message_id, marks_read)
            .await
        {
            Ok(true) => {
                found = true;
                break;
            }
            Ok(false) => {}
            Err(e) => {
                tracing::warn!(error = ?e, folder, "failed to update \\Seen flag on IMAP server");
            }
        }
    }

    session.logout().await;

    if !found {
        // Not an error: the message may live in a folder we don't sync, or
        // have been moved/deleted server-side.
        tracing::debug!(
            provider_message_id = %payload.provider_message_id,
            "message not found on IMAP server while mirroring read state"
        );
    }

    Ok(())
}
