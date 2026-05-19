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

    /// Idempotently records that `email` was seen from the mailbox
    /// identified by `link_id`, for the team `team_id`. Upserts
    /// `crm_companies` (+ `crm_domains`), `crm_contacts`, and
    /// `crm_contact_sources` in a single transaction. If the team has
    /// opted the contact's domain out (`crm_companies.email_sync = false`)
    /// the call is a no-op.
    fn populate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        email: &str,
    ) -> impl Future<Output = Result<(), CrmError>> + Send;

    /// Returns the team id `macro_id` belongs to, or `None` when the user
    /// has no team membership. See
    /// [`crate::domain::companies_repo::CompaniesRepository::get_team_id_for_user`]
    /// for tie-breaking when the user is on multiple teams.
    fn get_team_id_for_user(
        &self,
        macro_id: &str,
    ) -> impl Future<Output = Result<Option<uuid::Uuid>, CrmError>> + Send;
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

    #[tracing::instrument(skip(self), err)]
    async fn populate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        email: &str,
    ) -> Result<(), CrmError> {
        let email = email.trim();
        let Some((local_part, domain)) = email.split_once('@') else {
            return Err(CrmError::StorageLayerError(anyhow::anyhow!(
                "email {email} has no '@' separator"
            )));
        };
        if local_part.is_empty() {
            return Err(CrmError::StorageLayerError(anyhow::anyhow!(
                "email {email} has an empty local part"
            )));
        }
        if domain.is_empty() {
            return Err(CrmError::StorageLayerError(anyhow::anyhow!(
                "email {email} has an empty domain"
            )));
        }
        self.companies_repository
            .populate_contact(team_id, link_id, domain, email)
            .await
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_team_id_for_user(&self, macro_id: &str) -> Result<Option<uuid::Uuid>, CrmError> {
        self.companies_repository
            .get_team_id_for_user(macro_id)
            .await
    }
}
