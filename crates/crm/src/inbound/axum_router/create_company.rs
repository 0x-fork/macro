use axum::{Json, extract::State, http::StatusCode};
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::MacroUserTeamExtractor,
};
use model_error_response::ErrorResponse;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    domain::{auth::CrmTeamReceipt, model::CrmError, service::CrmService},
    inbound::axum_router::get_company::CrmCompanyResponse,
};

use super::CrmRouterState;

/// Request body for `POST /crm/companies`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateCrmCompanyRequest {
    /// Primary bare domain for the company, for example `acme.com`.
    pub domain: String,
}

/// Manually create a CRM company for the authenticated user's team.
#[utoipa::path(
    post,
    path = "/crm/companies",
    operation_id = "create_crm_company",
    request_body = CreateCrmCompanyRequest,
    responses(
        (status = 201, body = CrmCompanyResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err, fields(domain = %req.domain))]
pub async fn handler<C: CrmService, Eas: EntityAccessService>(
    access: MacroUserTeamExtractor<MemberTeamRole, Eas>,
    State(state): State<CrmRouterState<C, Eas>>,
    Json(req): Json<CreateCrmCompanyRequest>,
) -> Result<(StatusCode, Json<CrmCompanyResponse>), CrmError> {
    let access = CrmTeamReceipt::from_team_receipt(access.entity_access_receipt)?;
    let company = state.service.create_company(&access, &req.domain).await?;

    Ok((StatusCode::CREATED, Json(company.into())))
}
