use super::helpers::*;
use crate::{
    domain::{
        auth::CrmTeamReceipt,
        companies_repo::CompaniesRepository,
        model::CrmError,
        service::{CrmService, CrmServiceImpl},
    },
    outbound::{
        companies_repo::CompaniesRepositoryImpl, no_op_resolver::NoOpCompanyMetadataResolver,
    },
};
use entity_access::domain::models::MemberTeamRole;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn creates_company_and_primary_domain(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id, "macro|create-company@test.com").await?;
    enable_crm_for_team(&pool, team_id).await?;

    let repository = CompaniesRepositoryImpl::new(pool.clone());
    let company = repository.create_company(&team_id, "acme.com").await?;

    assert_eq!(company.team_id, team_id);
    assert!(company.email_sync);
    assert!(!company.hidden);
    assert_eq!(company.domains.len(), 1);
    assert_eq!(company.domains[0].domain, "acme.com");
    assert_eq!(
        fetch_company_for_domain(&pool, team_id, "acme.com").await?,
        Some(company.id)
    );
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn rejects_duplicate_domain_without_creating_orphan(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id, "macro|duplicate-company@test.com").await?;
    enable_crm_for_team(&pool, team_id).await?;

    let repository = CompaniesRepositoryImpl::new(pool.clone());
    repository.create_company(&team_id, "acme.com").await?;
    let error = repository
        .create_company(&team_id, "acme.com")
        .await
        .expect_err("duplicate domain must be rejected");

    assert!(matches!(error, CrmError::CompanyDomainAlreadyExists));
    assert_eq!(
        count_companies_for_domain(&pool, team_id, "acme.com").await?,
        1
    );
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn rejects_creation_when_team_crm_is_disabled(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id, "macro|disabled-crm@test.com").await?;

    let repository = CompaniesRepositoryImpl::new(pool.clone());
    let error = repository
        .create_company(&team_id, "acme.com")
        .await
        .expect_err("disabled CRM must reject manual creation");

    assert!(matches!(error, CrmError::CrmDisabledForTeam));
    assert_eq!(
        count_companies_for_domain(&pool, team_id, "acme.com").await?,
        0
    );
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn service_normalizes_domain(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id, "macro|normalize-company@test.com").await?;
    enable_crm_for_team(&pool, team_id).await?;

    let service = CrmServiceImpl::new(
        CompaniesRepositoryImpl::new(pool.clone()),
        NoOpCompanyMetadataResolver,
    );
    let access = CrmTeamReceipt::<MemberTeamRole>::dangerously_internal(team_id);
    let company = service.create_company(&access, "  ACME.COM  ").await?;

    assert_eq!(company.company.domains[0].domain, "acme.com");
    assert!(company.contacts.is_empty());
    Ok(())
}
