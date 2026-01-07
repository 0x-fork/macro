use crate::core::model::CHAT_MODELS;
use crate::model::response::models::{AIModel, GetModelsResponse};
use ai::types::ModelWithMetadataAndProvider;

use axum::{Json, http::StatusCode, response::IntoResponse};

pub fn get_ai_model_vec() -> Vec<AIModel> {
    CHAT_MODELS
        .iter()
        .map(|m| AIModel {
            name: m.to_string(),
            provider: m.provider(),
            metadata: m.metadata(),
        })
        .collect()
}

/// Gets all available models
#[utoipa::path(
        get,
        path = "/models",
        responses(
            (status = 200, body=GetModelsResponse),
        )
    )]
#[tracing::instrument()]
pub async fn get_models_handler() -> impl IntoResponse {
    let models = get_ai_model_vec();
    let data = GetModelsResponse { models };
    (StatusCode::OK, Json(data))
}
