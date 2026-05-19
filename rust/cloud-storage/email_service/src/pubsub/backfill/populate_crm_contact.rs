use crate::pubsub::context::PubSubContext;
use crm::domain::service::CrmService;
use models_email::email::service::backfill::{
    BackfillOperation, BackfillPubsubMessage, LinkScopedPayload, PopulateCrmContactPayload,
};
use models_email::email::service::link;
use models_email::email::service::pubsub::{DetailedError, FailureReason, ProcessingError};
use std::collections::HashSet;
use uuid::Uuid;

/// Idempotently records a contact the user has emailed into the CRM tables.
///
/// Fanned out one-per-recipient from `backfill_message` when the message was
/// sent by the user. Resolves the user's team (no-op if the user has no
/// team), then upserts `crm_companies`/`crm_domains`/`crm_contacts`/
/// `crm_contact_sources` atomically. A killswitch row
/// (`crm_companies.email_sync = false` for the contact's domain) is also a
/// no-op — see [`crm::domain::companies_repo::CompaniesRepository::populate_contact`].
#[tracing::instrument(skip(ctx), err, fields(contact_email = %p.contact_email, link_id = %link.id))]
pub async fn populate_crm_contact(
    ctx: &PubSubContext,
    link: &link::Link,
    p: &PopulateCrmContactPayload,
) -> Result<(), ProcessingError> {
    let macro_user_id = link.macro_id.to_string();

    let team_id = ctx
        .crm_service
        .get_team_id_for_user(&macro_user_id)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::DatabaseQueryFailed,
                source: anyhow::Error::from(e).context("Failed to look up team for link.macro_id"),
            })
        })?;

    let Some(team_id) = team_id else {
        tracing::debug!("User has no team; skipping CRM population");
        return Ok(());
    };

    ctx.crm_service
        .populate_contact(&team_id, &link.id, &p.contact_email)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::DatabaseQueryFailed,
                source: anyhow::Error::from(e).context("Failed to populate CRM contact"),
            })
        })?;

    Ok(())
}

/// Producer-side fan-out helper: normalizes and enqueues one
/// `PopulateCrmContact` message per distinct, non-self contact email.
///
/// Used by both the per-message path (`backfill_message`, called every
/// time a sent message is backfilled) and the historical path
/// (`populate_crm_for_user`, called once when a user is added to a team
/// to seed contacts from their existing sent mail). Centralising the
/// validation and dedup here means the two paths can't drift in subtle
/// ways — e.g. one normalising case-sensitively while the other doesn't.
///
/// Normalization on each input:
///   - `trim()` + `to_ascii_lowercase()`
///   - drops anything without `@` (defensive against malformed addresses)
///   - drops the caller's own address (`self_email`, expected pre-lowercased)
///   - dedupes within this invocation
pub async fn enqueue_populate_crm_contacts(
    ctx: &PubSubContext,
    link_id: Uuid,
    self_email: &str,
    contact_emails: impl IntoIterator<Item = String>,
) -> Result<(), ProcessingError> {
    let mut seen: HashSet<String> = HashSet::new();

    for raw in contact_emails {
        let contact_email = raw.trim().to_ascii_lowercase();
        if !contact_email.contains('@') || contact_email == self_email {
            continue;
        }
        if !seen.insert(contact_email.clone()) {
            continue;
        }

        let ps_message = BackfillPubsubMessage {
            backfill_operation: BackfillOperation::PopulateCrmContact(LinkScopedPayload {
                link_id,
                payload: PopulateCrmContactPayload { contact_email },
            }),
        };

        ctx.sqs_client
            .enqueue_email_backfill_message(ps_message)
            .await
            .map_err(|e| {
                ProcessingError::Retryable(DetailedError {
                    reason: FailureReason::SqsEnqueueFailed,
                    source: e.context("Failed to enqueue PopulateCrmContact message"),
                })
            })?;
    }

    Ok(())
}
