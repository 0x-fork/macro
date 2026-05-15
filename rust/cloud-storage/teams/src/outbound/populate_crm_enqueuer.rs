//! SQS-backed adapter for the
//! [`crate::domain::populate_crm_enqueuer::PopulateCrmEnqueuer`] port.
//!
//! Publishes a `BackfillOperation::PopulateCrmForUser` message onto the
//! email backfill queue (the same queue `email_service` consumes from for
//! its backfill worker). This is the only file in the teams crate that
//! depends on `models_email` — the port itself speaks in domain types
//! only, so consumers that don't need SQS enqueueing (tests, callers using
//! a no-op) never pull `models_email` in.

use crate::domain::populate_crm_enqueuer::PopulateCrmEnqueuer;
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};
use models_email::email::service::backfill::{
    BackfillOperation, BackfillPubsubMessage, PopulateCrmForUserPayload,
};

/// SQS adapter for [`PopulateCrmEnqueuer`]. Wraps a `sqs_client::SQS` that
/// must have been built with `.email_backfill_queue(...)` set.
#[derive(Clone, Debug)]
pub struct SqsPopulateCrmEnqueuer {
    /// The underlying SQS client. Expected to have `email_backfill_queue`
    /// configured.
    sqs: sqs_client::SQS,
}

impl SqsPopulateCrmEnqueuer {
    /// Creates a new SqsPopulateCrmEnqueuer over the given SQS client.
    pub fn new(sqs: sqs_client::SQS) -> Self {
        Self { sqs }
    }
}

impl PopulateCrmEnqueuer for SqsPopulateCrmEnqueuer {
    type Err = anyhow::Error;

    #[tracing::instrument(skip(self), err)]
    async fn enqueue_populate_crm_for_user(
        &self,
        macro_id: &MacroUserIdStr<'_>,
    ) -> Result<(), Self::Err> {
        // The payload owns the macro_id with a 'static lifetime — clone
        // into an owned `MacroUserIdStr<'static>` so it can be serialized
        // and shipped through SQS.
        let macro_id_owned: MacroUserIdStr<'static> = macro_id.clone().into_owned();

        let message = BackfillPubsubMessage {
            backfill_operation: BackfillOperation::PopulateCrmForUser(PopulateCrmForUserPayload {
                macro_id: macro_id_owned,
            }),
        };

        self.sqs.enqueue_email_backfill_message(message).await
    }
}
