//! Handles an Outlook change notification by running a Microsoft Graph delta
//! sync for the affected link.
//!
//! This is the Outlook analogue of
//! [`crate::pubsub::inbox_sync::operations::gmail_message`]: where the Gmail
//! handler walks the inbox *history* from a stored `historyId`, this handler
//! walks a *delta query* and reconciles the changed messages.
//!
//! Status: this performs the full read side of the sync — token fetch, folder →
//! system-label resolution, delta enumeration, and per-message fetch + convert
//! to the provider-agnostic [`Message`](models_email::service::message::Message).
//! Persisting the converted messages reuses the inbound upsert pipeline, which
//! is currently Gmail-specific; extracting a provider-agnostic upsert is the
//! next increment (see the TODO below). Likewise, the persisted delta link that
//! makes the sync incremental is part of that increment — until then we do a
//! bounded initial delta of the inbox each time, which is correct but not
//! minimal.

use crate::pubsub::context::PubSubContext;
use models_email::gmail::inbox_sync::OutlookNotificationPayload;
use models_email::outlook::well_known_folder;
use models_email::service::link;
use models_email::service::pubsub::{DetailedError, FailureReason, ProcessingError};
use std::collections::HashMap;

#[tracing::instrument(skip(ctx))]
pub async fn outlook_notification(
    ctx: &PubSubContext,
    link: &link::Link,
    payload: &OutlookNotificationPayload,
) -> Result<(), ProcessingError> {
    let access_token = crate::util::outlook::auth::fetch_token_or_delete_on_revocation(
        link,
        &ctx.auth_service_client,
        &ctx.sqs_client,
    )
    .await
    .map_err(|e| {
        ProcessingError::NonRetryable(DetailedError {
            reason: FailureReason::AccessTokenFetchFailed,
            source: e.context("Failed to fetch Outlook access token"),
        })
    })?;

    // Resolve folders so we can map each message's parent folder to a system
    // label (INBOX / SENT / SPAM / TRASH / DRAFT).
    let folders = ctx
        .outlook_client
        .list_folders(&access_token)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::GmailApiFailed,
                source: anyhow::Error::new(e).context("Failed to list Outlook folders"),
            })
        })?;

    let folder_labels: HashMap<String, &'static str> = folders
        .iter()
        .filter_map(|f| {
            let label = f
                .well_known_name
                .as_deref()
                .and_then(well_known_folder::to_system_label)?;
            Some((f.id.clone(), label))
        })
        .collect();

    let inbox_folder_id = folders
        .iter()
        .find(|f| {
            f.well_known_name
                .as_deref()
                .is_some_and(|w| w.eq_ignore_ascii_case("inbox"))
        })
        .map(|f| f.id.clone())
        .unwrap_or_else(|| "inbox".to_string());

    // TODO(outlook): load the persisted `@odata.deltaLink` for this link/folder
    // and call `delta_from_link` for a true incremental sync; persist the
    // returned link afterwards. Until that store exists we run an initial delta.
    let changes = ctx
        .outlook_client
        .initial_delta(&access_token, &inbox_folder_id)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::GmailApiFailed,
                source: anyhow::Error::new(e).context("Failed to run Outlook delta sync"),
            })
        })?;

    tracing::info!(
        link_id = %link.id,
        subscription_id = %payload.subscription_id,
        to_upsert = changes.message_ids_to_upsert.len(),
        to_delete = changes.message_ids_to_delete.len(),
        "outlook delta sync computed changes"
    );

    // Fetch + convert each changed message. This exercises the full client →
    // convert path; persistence is the next increment.
    for message_id in &changes.message_ids_to_upsert {
        let Some(resource) = ctx
            .outlook_client
            .get_message(&access_token, message_id)
            .await
            .map_err(|e| {
                ProcessingError::Retryable(DetailedError {
                    reason: FailureReason::GmailApiFailed,
                    source: anyhow::Error::new(e).context("Failed to fetch Outlook message"),
                })
            })?
        else {
            continue;
        };

        let folder_label = resource
            .parent_folder_id
            .as_deref()
            .and_then(|fid| folder_labels.get(fid).copied());

        let _message =
            outlook_client::convert::map_message_resource_to_service(resource, link.id, folder_label);

        // TODO(outlook): persist `_message` via a provider-agnostic inbound
        // upsert (extracted from `operations::upsert_message`), then notify
        // search and run the CRM/notification fan-out as the Gmail path does.
        tracing::debug!(
            link_id = %link.id,
            provider_message_id = %message_id,
            "converted outlook message (persistence pending)"
        );
    }

    Ok(())
}
