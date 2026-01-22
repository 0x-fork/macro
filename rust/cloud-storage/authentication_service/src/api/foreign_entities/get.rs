use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use urlencoding::decode;

use crate::api::context::ApiContext;
use foreign_entity_db_client;
use model::response::ErrorResponse;
use model::user::UserContext;
use model_entity::{NamespacedIdentifier, NamespacedIdentifierError};

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ForeignEntityResponse {
    /// UUID of the foreign entity
    pub id: String,
    /// The full namespaced identifier
    pub namespaced_identifier: String,
}

/// Error type for get foreign entity operations
#[derive(thiserror::Error, Debug)]
pub enum GetForeignEntityError {
    /// Invalid URL encoding
    #[error("invalid URL encoding")]
    InvalidUrlEncoding,
    /// Invalid namespaced identifier format
    #[error("invalid namespaced identifier: {0}")]
    InvalidNamespacedIdentifier(#[from] NamespacedIdentifierError),
    /// Foreign entity not found
    #[error("foreign entity not found")]
    NotFound,
    /// Database operation failed
    #[error("database error: {0}")]
    DatabaseError(#[from] anyhow::Error),
}

impl IntoResponse for GetForeignEntityError {
    fn into_response(self) -> Response {
        let (status_code, message): (StatusCode, &str) = match &self {
            GetForeignEntityError::InvalidUrlEncoding => {
                (StatusCode::BAD_REQUEST, "invalid URL encoding")
            }
            GetForeignEntityError::InvalidNamespacedIdentifier(_) => {
                (StatusCode::BAD_REQUEST, "invalid namespaced identifier")
            }
            GetForeignEntityError::NotFound => {
                (StatusCode::NOT_FOUND, "foreign entity not found")
            }
            GetForeignEntityError::DatabaseError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "failed to query foreign entity")
            }
        };

        (
            status_code,
            Json(ErrorResponse { message }),
        )
            .into_response()
    }
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
#[tracing::instrument(skip(ctx, user_context), err, fields(user_id=%user_context.user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Path(namespaced_id): Path<String>,
) -> Result<Json<ForeignEntityResponse>, GetForeignEntityError> {
    tracing::info!(namespaced_id=%namespaced_id, "get_foreign_entity called");

    // URL decode the namespaced identifier
    let decoded = decode(&namespaced_id)
        .map_err(|_| GetForeignEntityError::InvalidUrlEncoding)?
        .to_string();

    // Parse the namespaced identifier
    let ns_id = NamespacedIdentifier::parse(&decoded)?;

    // Get the foreign entity
    let entity = foreign_entity_db_client::get_by_namespaced_identifier(&ctx.db, &ns_id)
        .await?
        .ok_or(GetForeignEntityError::NotFound)?;

    Ok(Json(ForeignEntityResponse {
        id: entity.id.to_string(),
        namespaced_identifier: entity.namespaced_identifier,
    }))
}
