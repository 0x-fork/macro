use ai::types::{Model, ModelMetadata, ModelWithMetadataAndProvider, Provider};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, Debug, ToSchema)]
pub struct AIModel {
    pub name: String,
    pub provider: Provider,
    pub metadata: ModelMetadata,
}

impl From<Model> for AIModel {
    fn from(value: Model) -> Self {
        AIModel {
            name: value.to_string(),
            provider: value.provider(),
            metadata: value.metadata(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, ToSchema)]
pub struct GetModelsResponse {
    pub models: Vec<AIModel>,
}
