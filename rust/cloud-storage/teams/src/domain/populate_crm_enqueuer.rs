//! Outbound port for triggering a "populate CRM for user" backfill from the
//! teams service.
//!
//! The teams service uses this to ask the email service to seed its
//! `crm_contacts`/`crm_contact_sources` tables with the contacts a user has
//! previously emailed, at the moment that user joins a team. The teams
//! service does not know — and does not need to know — that the email
//! service consumes this via a pubsub queue; the port keeps the contract
//! to domain types only. See `sqs_client::teams` for the SQS adapter.
//!
//! Modeled on [`email::domain::ports::EmailMessageEnqueuer`].

use macro_user_id::user_id::MacroUserIdStr;

/// Asks the email service to seed the CRM tables with the user's historical
/// sent-mail contacts. Implementations are expected to be best-effort and
/// fire-and-forget — callers (e.g. `join_team`) log and swallow failures
/// rather than rolling back the team membership.
pub trait PopulateCrmEnqueuer: Clone + Send + Sync + 'static {
    /// Error type for enqueue operations.
    type Err: std::fmt::Display + std::fmt::Debug + Send;

    /// Enqueue a request to populate the CRM tables for `macro_id`. The user
    /// is expected to already be a member of a team at the time this fires —
    /// the email-service consumer re-checks team membership and per-domain
    /// killswitches, so a race with `remove_user_from_team` is safe.
    fn enqueue_populate_crm_for_user(
        &self,
        macro_id: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;
}

/// No-op enqueuer for callers that don't need the CRM seeding side effect
/// (e.g. unit tests, callers that don't have SQS wired up).
#[derive(Clone, Debug)]
pub struct NoOpPopulateCrmEnqueuer;

impl PopulateCrmEnqueuer for NoOpPopulateCrmEnqueuer {
    type Err = std::convert::Infallible;

    async fn enqueue_populate_crm_for_user(
        &self,
        _macro_id: &MacroUserIdStr<'_>,
    ) -> Result<(), Self::Err> {
        Ok(())
    }
}
