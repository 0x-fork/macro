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
}
