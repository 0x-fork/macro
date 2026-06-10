use crate::domain::MemoryService;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use model_user::axum_extractor::MacroUserExtractor;
use serde::Serialize;
use std::sync::Arc;
use utoipa::ToSchema;

/// The user's latest memories.
#[derive(Serialize, ToSchema)]
pub struct MemoryResponse {
    /// The user's personal memory, if one has been generated.
    pub memory: Option<String>,
    /// The latest memory of the user's team, if the user belongs to a team
    /// and a team memory has been generated.
    pub team_memory: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct MemoryErrorBody {
    /// Error description.
    pub error: String,
}

pub fn memory_router<T, S>(service: Arc<T>) -> Router<S>
where
    T: MemoryService + Send + Sync + 'static,
    S: Send + Sync + Clone + 'static,
{
    Router::new()
        .route("/memory", get(get_memory_handler::<T>))
        .with_state(service)
}

/// Get the authenticated user's latest personal and team memories.
///
/// Returns whichever memories currently exist. If either memory is stale or
/// missing, a background generation for it is triggered and the endpoint
/// returns the stale values (200), or 404 if neither exists yet.
#[utoipa::path(
    get,
    path = "/memory",
    responses(
        (status = 200, description = "Latest personal and team memories for the user", body = MemoryResponse),
        (status = 404, description = "No memory exists for this user or their team yet (generation triggered)"),
        (status = 500, description = "Internal server error", body = MemoryErrorBody),
    ),
    tag = "memory"
)]
#[tracing::instrument(skip(service, user), fields(user_id = %user.macro_user_id))]
pub async fn get_memory_handler<T: MemoryService>(
    State(service): State<Arc<T>>,
    user: MacroUserExtractor,
) -> Response {
    match service.get_or_generate_memory(user.macro_user_id).await {
        Ok(memories) if memories.user.is_none() && memories.team.is_none() => {
            StatusCode::NOT_FOUND.into_response()
        }
        Ok(memories) => Json(MemoryResponse {
            memory: memories.user,
            team_memory: memories.team,
        })
        .into_response(),
        Err(e) => {
            tracing::error!(error = ?e, "failed to get memory");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(MemoryErrorBody {
                    error: "failed to get memory".to_string(),
                }),
            )
                .into_response()
        }
    }
}
