use axum::{
    Extension, Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::api::context::ApiContext;
use macro_db_client::foreign_entity;
use model::response::ErrorResponse;
use model::user::UserContext;
use model_entity::NamespacedIdentifier;

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateForeignEntityRequest {
    /// The namespaced identifier (e.g., "github::repo:owner/name")
    pub namespaced_identifier: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ForeignEntityResponse {
    /// UUID of the foreign entity
    pub id: String,
    /// The full namespaced identifier
    pub namespaced_identifier: String,
}

/// Create or get a foreign entity
///
/// This endpoint is idempotent - if the foreign entity already exists,
/// it returns the existing one. Otherwise, it creates a new one.
#[utoipa::path(
    post,
    operation_id = "create_foreign_entity",
    path = "/foreign-entities",
    request_body = CreateForeignEntityRequest,
    responses(
        (status = 200, body=ForeignEntityResponse, description = "Foreign entity created or already exists"),
        (status = 400, body=ErrorResponse, description = "Invalid namespaced identifier"),
        (status = 401, body=ErrorResponse, description = "Not authenticated"),
        (status = 500, body=ErrorResponse, description = "Server error"),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Json(payload): Json<CreateForeignEntityRequest>,
) -> Result<Response, Response> {
    tracing::info!("create_foreign_entity called");

    // Parse the namespaced identifier
    let ns_id = NamespacedIdentifier::parse(&payload.namespaced_identifier).map_err(|e| {
        tracing::error!(error=?e, "invalid namespaced identifier");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: &format!("invalid namespaced identifier: {}", e),
            }),
        )
            .into_response()
    })?;

    // Get or create the foreign entity
    let entity = foreign_entity::get_or_create(&ctx.db, ns_id)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to create foreign entity");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "failed to create foreign entity",
                }),
            )
                .into_response()
        })?;

    Ok((
        StatusCode::OK,
        Json(ForeignEntityResponse {
            id: entity.id.to_string(),
            namespaced_identifier: entity.namespaced_identifier,
        }),
    )
        .into_response())
}
