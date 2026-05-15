use crate::pubsub::context::PubSubContext;
use crm::domain::service::CrmService;
use models_email::email::service::backfill::{
    BackfillOperation, BackfillPubsubMessage, LinkScopedPayload, PopulateCrmContactPayload,
    PopulateCrmForUserPayload,
};
use models_email::email::service::pubsub::{DetailedError, FailureReason, ProcessingError};

/// Seeds the team's CRM tables with every contact the user has sent email
/// to in the past. Triggered when a user is added to a team — the user only
/// has their macro_id at this point, so this handler resolves the link and
/// team itself, then fans out one `PopulateCrmContact` job per distinct
/// recipient of a sent message on that link.
///
/// No-ops (acks the message) when the user has no email link or no team
/// membership. The downstream `PopulateCrmContact` consumer is idempotent
/// and re-checks the team membership + per-domain killswitch, so racing
/// removals between fan-out and consumption are safe.
#[tracing::instrument(skip(ctx), fields(macro_id = %payload.macro_id))]
pub async fn populate_crm_for_user(
    ctx: &PubSubContext,
    payload: &PopulateCrmForUserPayload,
) -> Result<(), ProcessingError> {
    let link = email_db_client::links::get::fetch_link_by_macro_id(&ctx.db, &payload.macro_id)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::DatabaseQueryFailed,
                source: e.context("Failed to fetch link by macro_id"),
            })
        })?;

    let Some(link) = link else {
        tracing::debug!("User has no email link; skipping CRM fan-out");
        return Ok(());
    };

    let team_id = ctx
        .crm_service
        .get_team_id_for_user(&payload.macro_id)
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::DatabaseQueryFailed,
                source: anyhow::Error::from(e).context("Failed to look up team for macro_id"),
            })
        })?;

    if team_id.is_none() {
        tracing::debug!("User has no team; skipping CRM fan-out");
        return Ok(());
    }

    let self_email = link.email_address.0.as_ref().to_ascii_lowercase();

    // Pull every distinct recipient address from sent messages on this link.
    // Mirrors what backfill_message::enqueue_populate_crm_for_recipients
    // would have produced if the per-message fan-out had been running when
    // these messages were first backfilled.
    let recipient_emails =
        email_db_client::contacts::get::fetch_sent_message_recipient_emails_by_link(
            &ctx.db, link.id,
        )
        .await
        .map_err(|e| {
            ProcessingError::Retryable(DetailedError {
                reason: FailureReason::DatabaseQueryFailed,
                source: e.context("Failed to fetch sent-message recipients"),
            })
        })?;

    for contact_email in recipient_emails {
        if !contact_email.contains('@') || contact_email == self_email {
            continue;
        }

        let ps_message = BackfillPubsubMessage {
            backfill_operation: BackfillOperation::PopulateCrmContact(LinkScopedPayload {
                link_id: link.id,
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
