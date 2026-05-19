//! Port for persistence operations on CRM companies.

use crate::domain::model::{CrmCompany, CrmError};

/// The CompaniesRepository defines persistence operations for CRM
/// companies and their associated domains.
pub trait CompaniesRepository: Clone + Send + Sync + 'static {
    /// Fetches the company for the given team that has `domain` registered
    /// against it, hydrated with the full list of domains belonging to that
    /// company. Returns `Ok(None)` when no company in the team has the
    /// domain registered. Domain matching is case-insensitive.
    fn get_company_by_domain(
        &self,
        team_id: &uuid::Uuid,
        domain: &str,
    ) -> impl Future<Output = Result<Option<CrmCompany>, CrmError>> + Send;

    /// Idempotently records that `email` (which lives on `domain`) was seen
    /// from the mailbox identified by `link_id`, for the team `team_id`.
    /// Performs the company/domain/contact/contact_source upserts in a single
    /// transaction:
    ///
    /// 1. Look up the company for `(team_id, domain)`.
    ///    - If a row exists with `email_sync = false` the team has opted
    ///      this domain out (the killswitch): no rows are written and the
    ///      method returns `Ok(())` so the caller can ack the job.
    ///    - If a row exists with `email_sync = true` it is reused.
    ///    - Otherwise a new `crm_companies` row (name = `"TODO"`) and a
    ///      matching `crm_domains` row are inserted.
    /// 2. Upsert `crm_contacts (company_id, email)` with
    ///    `ON CONFLICT DO NOTHING`.
    /// 3. Upsert `crm_contact_sources (contact_id, link_id)` with
    ///    `ON CONFLICT DO NOTHING`.
    ///
    /// `domain` and `email` are both normalized to lowercase before storage
    /// and comparison.
    fn populate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        domain: &str,
        email: &str,
    ) -> impl Future<Output = Result<(), CrmError>> + Send;

    /// Reverses [`populate_contact`] for one `(link_id, email)`: drops the
    /// matching `crm_contact_sources` row, then `crm_contacts` if no other
    /// source rows remain for that contact, then `crm_companies` (cascading
    /// to `crm_domains`) if no other contact rows remain for that company.
    /// Runs in a single transaction holding the same advisory lock that
    /// [`populate_contact`] takes, so a concurrent populate for the same
    /// `(team_id, domain)` is serialized against this teardown.
    ///
    /// The company-level `email_sync` killswitch is **intentionally
    /// ignored**: deletions stay reflected in the CRM tables even when
    /// the team has opted the domain out, so we don't accumulate stale
    /// rows after a domain is later re-enabled.
    ///
    /// No-op (returns `Ok(())`) when the contact / company / domain is
    /// not found for `(team_id, domain, email)`. `domain` and `email` are
    /// matched case-insensitively.
    fn depopulate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        domain: &str,
        email: &str,
    ) -> impl Future<Output = Result<(), CrmError>> + Send;

    /// Returns the team id that `macro_id` belongs to. When the user is on
    /// multiple teams the highest-privileged role wins (Postgres orders the
    /// `team_role` enum as `member < admin < owner`), matching the
    /// behavior of `entity_access::ports::get_user_team`. Returns
    /// `Ok(None)` when the user has no team membership.
    fn get_team_id_for_user(
        &self,
        macro_id: &str,
    ) -> impl Future<Output = Result<Option<uuid::Uuid>, CrmError>> + Send;
}
