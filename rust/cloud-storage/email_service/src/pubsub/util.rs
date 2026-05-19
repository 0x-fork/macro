use crate::pubsub::context::PubSubContext;
use crate::util::redis::RedisClient;
use crate::util::redis::rate_limit::RateLimitArgs;
use connection_gateway_client::client::ConnectionGatewayClient;
/// shared utils across different pubsub workers
use models_email::email::service::backfill::{
    BackfillOperation, BackfillPubsubMessage, DepopulateCrmContactPayload, LinkScopedPayload,
    PopulateCrmContactPayload,
};
use models_email::email::service::pubsub::{DetailedError, FailureReason, ProcessingError};
use models_email::gmail::operations::GmailApiOperation;
use std::collections::HashSet;
use uuid::Uuid;

/// Arguments for checking Gmail API rate limits
pub struct CheckGmailRateLimitArgs<'a> {
    pub redis_client: &'a RedisClient,
    pub link_id: Uuid,
    pub gmail_operation: GmailApiOperation,
    pub retryable: bool,
    pub is_backfill: bool,
}

// check if we are rate limited by gmail before making any requests to the api
pub async fn check_gmail_rate_limit(
    args: CheckGmailRateLimitArgs<'_>,
) -> Result<(), ProcessingError> {
    if args
        .redis_client
        .is_rate_limited(RateLimitArgs {
            user_id: args.link_id,
            operation: args.gmail_operation,
            is_backfill: args.is_backfill,
        })
        .await
    {
        return if args.retryable {
            Err(ProcessingError::Retryable(DetailedError {
                reason: FailureReason::GmailApiRateLimited,
                source: anyhow::Error::msg("Gmail API rate limit exceeded"),
            }))
        } else {
            Err(ProcessingError::NonRetryable(DetailedError {
                reason: FailureReason::GmailApiRateLimited,
                source: anyhow::Error::msg("Gmail API rate limit exceeded"),
            }))
        };
    }

    Ok(())
}

#[tracing::instrument(skip(tx, result), level = "debug")]
pub async fn complete_transaction_with_processing_error<T>(
    tx: sqlx::Transaction<'_, sqlx::Postgres>,
    result: Result<T, ProcessingError>,
) -> Result<T, ProcessingError> {
    match result {
        Ok(value) => {
            tx.commit().await.map_err(|e| {
                ProcessingError::Retryable(DetailedError {
                    reason: FailureReason::DatabaseQueryFailed,
                    source: anyhow::Error::from(e).context("Failed to commit transaction"),
                })
            })?;

            Ok(value)
        }
        Err(e) => match tx.rollback().await {
            Ok(_) => Err(e),
            Err(rollback_err) => {
                let combined_error = anyhow::anyhow!(
                    "Operation failed AND transaction rollback failed. Original error: {:?}, Rollback error: {:?}",
                    e,
                    rollback_err
                );

                Err(ProcessingError::Retryable(DetailedError {
                    reason: FailureReason::DatabaseQueryFailed,
                    source: combined_error,
                }))
            }
        },
    }
}

/// Send message to connection gateway to trigger email refresh if user is active on FE
#[tracing::instrument(skip(client), level = "debug")]
pub async fn cg_refresh_email(client: &ConnectionGatewayClient, macro_id: &str, event_type: &str) {
    if cfg!(feature = "connection_gateway") {
        let _ = client
            .refresh_email(macro_id, event_type)
            .await
            .inspect_err(|e| tracing::error!(macro_id = %macro_id, "Failed to refresh email: {e}"));
    }
}

/// Producer-side fan-out helper: normalizes and enqueues one
/// `PopulateCrmContact` message per distinct, non-self contact email.
///
/// Used by both the per-message paths (`backfill_message` and
/// `upsert_message`, called every time a sent message is observed) and
/// the historical path (`populate_crm_for_user`, called once when a user
/// is added to a team to seed contacts from their existing sent mail).
/// Centralising the validation and dedup here means the paths can't drift
/// in subtle ways — e.g. one normalising case-sensitively while the other
/// doesn't.
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

/// Producer-side fan-out helper for tearing CRM contacts down when a sent
/// message is deleted. Mirrors [`enqueue_populate_crm_contacts`]: normalizes,
/// drops malformed and self-emails, and dedupes within the call.
///
/// Used by `delete_message` in the inbox-sync worker. The consumer
/// (`depopulate_crm_contact`) re-checks whether the link still has any
/// sent message to the contact before deleting, so duplicate enqueues
/// from retries are harmless.
pub async fn enqueue_depopulate_crm_contacts(
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
            backfill_operation: BackfillOperation::DepopulateCrmContact(LinkScopedPayload {
                link_id,
                payload: DepopulateCrmContactPayload { contact_email },
            }),
        };

        ctx.sqs_client
            .enqueue_email_backfill_message(ps_message)
            .await
            .map_err(|e| {
                ProcessingError::Retryable(DetailedError {
                    reason: FailureReason::SqsEnqueueFailed,
                    source: e.context("Failed to enqueue DepopulateCrmContact message"),
                })
            })?;
    }

    Ok(())
}
