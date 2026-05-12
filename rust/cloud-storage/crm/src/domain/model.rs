//! Domain models for CRM companies and their related records.

use chrono::{DateTime, Utc};

/// A known external company tracked by a team (CRM-style record). A company
/// aggregates one or more email domains and individual contacts that are
/// considered to belong to the same external party.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CrmCompany {
    /// The id of the company
    pub id: uuid::Uuid,
    /// The id of the team that owns this company record
    pub team_id: uuid::Uuid,
    /// The display name of the company
    pub name: String,
    /// Whether email sync is enabled for this company
    pub email_sync: bool,
    /// When the company was created
    pub created_at: DateTime<Utc>,
    /// All domains associated with this company
    pub domains: Vec<CrmDomain>,
}

/// A domain (e.g. "acme.com") associated with a [`CrmCompany`]. A company
/// may have many domains.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CrmDomain {
    /// The id of the domain record
    pub id: uuid::Uuid,
    /// The id of the company the domain belongs to
    pub company_id: uuid::Uuid,
    /// The domain (e.g. "acme.com"). Stored lowercased.
    pub domain: String,
    /// When the domain record was created
    pub created_at: DateTime<Utc>,
}

/// Errors that can occur in the CRM domain.
#[derive(Debug, thiserror::Error)]
pub enum CrmError {
    /// Storage layer error
    #[error("Storage layer error {0}")]
    StorageLayerError(#[from] anyhow::Error),
}
