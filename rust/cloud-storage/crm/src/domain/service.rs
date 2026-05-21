//! The CrmService trait and its default implementation.

use crate::domain::{
    companies_repo::CompaniesRepository,
    model::{CrmCompany, CrmError},
};

/// The CrmService exposes operations over CRM records (companies, their
/// domains and contacts).
pub trait CrmService: Clone + Send + Sync + 'static {
    /// Fetches the company for the given team that has `domain` registered
    /// against it, hydrated with all of the company's domains. Returns
    /// `Ok(None)` when no company in the team has that domain.
    fn get_company_by_domain(
        &self,
        team_id: &uuid::Uuid,
        domain: &str,
    ) -> impl Future<Output = Result<Option<CrmCompany>, CrmError>> + Send;
}

/// Implementation of [`CrmService`] backed by a [`CompaniesRepository`].
#[derive(Debug)]
pub struct CrmServiceImpl<CR>
where
    CR: CompaniesRepository,
{
    /// The underlying companies repository
    companies_repository: CR,
}

impl<CR> Clone for CrmServiceImpl<CR>
where
    CR: CompaniesRepository,
{
    fn clone(&self) -> Self {
        Self {
            companies_repository: self.companies_repository.clone(),
        }
    }
}

impl<CR> CrmServiceImpl<CR>
where
    CR: CompaniesRepository,
{
    /// Creates a new CrmServiceImpl
    pub fn new(companies_repository: CR) -> Self {
        Self {
            companies_repository,
        }
    }
}

impl<CR> CrmService for CrmServiceImpl<CR>
where
    CR: CompaniesRepository,
{
    #[tracing::instrument(skip(self), err)]
    async fn get_company_by_domain(
        &self,
        team_id: &uuid::Uuid,
        domain: &str,
    ) -> Result<Option<CrmCompany>, CrmError> {
        self.companies_repository
            .get_company_by_domain(team_id, domain)
            .await
    }
}
