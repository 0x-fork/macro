use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use urlencoding::decode;

use crate::api::context::ApiContext;
use macro_db_client::foreign_entity;
use model::response::ErrorResponse;
use model::user::UserContext;
use model_entity::NamespacedIdentifier;

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ForeignEntityResponse {
    /// UUID of the foreign entity
    pub id: String,
    /// The full namespaced identifier
    pub namespaced_identifier: String,
}

/// Get a foreign entity by namespaced identifier
#[utoipa::path(
    get,
    operation_id = "get_foreign_entity",
    path = "/foreign-entities/{namespaced_id}",
    params(
        ("namespaced_id" = String, Path, description = "URL-encoded namespaced identifier (e.g., github::repo:owner/name)")
    ),
    responses(
        (status = 200, body=ForeignEntityResponse, description = "Foreign entity found"),
        (status = 400, body=ErrorResponse, description = "Invalid namespaced identifier"),
        (status = 404, body=ErrorResponse, description = "Foreign entity not found"),
        (status = 401, body=ErrorResponse, description = "Not authenticated"),
        (status = 500, body=ErrorResponse, description = "Server error"),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=%user_context.user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Path(namespaced_id): Path<String>,
) -> Result<Response, Response> {
    tracing::info!(namespaced_id=%namespaced_id, "get_foreign_entity called");

    // URL decode the namespaced identifier
    let decoded = decode(&namespaced_id)
        .map_err(|e| {
            tracing::error!(error=?e, "failed to decode namespaced identifier");
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: "invalid URL encoding",
                }),
            )
                .into_response()
        })?
        .to_string();

    // Parse the namespaced identifier
    let ns_id = NamespacedIdentifier::parse(&decoded).map_err(|e| {
        tracing::error!(error=?e, "invalid namespaced identifier");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: &format!("invalid namespaced identifier: {}", e),
            }),
        )
            .into_response()
    })?;

    // Get the foreign entity
    let entity = foreign_entity::get_by_namespaced_identifier(&ctx.db, &ns_id)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to query foreign entity");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "failed to query foreign entity",
                }),
            )
                .into_response()
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: "foreign entity not found",
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
