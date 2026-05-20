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
    /// 2. Upsert `crm_contacts (company_id, email, name)` with
    ///    `ON CONFLICT DO UPDATE SET name = COALESCE(crm_contacts.name, EXCLUDED.name)`
    ///    so the first non-NULL name wins and later populates can't
    ///    overwrite it.
    /// 3. Upsert `crm_contact_sources (contact_id, link_id)` with
    ///    `ON CONFLICT DO NOTHING`.
    ///
    /// `domain` and `email` are both normalized to lowercase before storage
    /// and comparison. `name` is the display name observed for `email` on
    /// this user's link (sourced from `email_contacts.name` by the
    /// caller); pass `None` when no display name is available.
    fn populate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        domain: &str,
        email: &str,
        name: Option<&str>,
    ) -> impl Future<Output = Result<(), CrmError>> + Send;

    /// Reverses [`populate_contact`] for one `(link_id, email)`: drops the
    /// matching `crm_contact_sources` row, then `crm_contacts` if no other
    /// source rows remain for that contact, then `crm_companies` (cascading
    /// to `crm_domains`) if no other contact rows remain for that company
    /// **and** the company has `email_sync = true`. Companies with
    /// `email_sync = false` (the killswitch opt-out) are kept so the
    /// team's configuration survives teardown — a future populate will
    /// re-discover the row and short-circuit on the same flag.
    ///
    /// Source and contact rows are derived data and are always cleaned
    /// up regardless of the killswitch.
    ///
    /// The whole cascade runs in a single transaction that begins by
    /// acquiring the same advisory lock [`populate_contact`] takes (key
    /// `"{team_id}:{lower(domain)}"`) **before** observing any state, so
    /// a concurrent in-flight populate for the same `(team_id, domain)`
    /// can't slip an uncommitted insert past the existence check.
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

    /// Bulk counterpart to [`depopulate_contact`]: removes everything
    /// the link contributed to a single team's CRM rows. In one
    /// transaction:
    ///   1. Delete every `crm_contact_sources` row whose `link_id`
    ///      matches AND whose contact lives under `team_id`.
    ///   2. Delete every `crm_contacts` row in `team_id` that has no
    ///      remaining `crm_contact_sources` (orphaned by step 1 or by
    ///      any earlier cleanup race).
    ///   3. Delete every `crm_companies` row in `team_id` that has no
    ///      remaining `crm_contacts` AND `email_sync = true`. Companies
    ///      with `email_sync = false` are preserved so the team's
    ///      killswitch configuration survives teardown. `crm_domains`
    ///      falls out via FK cascade.
    ///
    /// Scoping every query to `team_id` keeps the blast radius bounded
    /// — sources the link contributed to a *different* team (from a
    /// prior membership) are untouched — and lets the orphan cleanup
    /// run as a single SQL pass per layer instead of snapshotting
    /// candidate ids into memory first.
    ///
    /// Does NOT take per-`(team, domain)` advisory locks. A link can
    /// span many domains within a team, and a concurrent populate on
    /// the same team won't see the user as a member once the team
    /// membership change has propagated, so the race window is benign.
    ///
    /// Used by the `DepopulateCrmForUser` backfill step (fired when a
    /// user is removed from a team).
    fn depopulate_link_in_team(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
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
