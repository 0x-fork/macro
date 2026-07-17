use std::{collections::HashMap, sync::Arc};

use async_graphql::{Context, dataloader::DataLoader};
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;

/// Identity used to lazily resolve an entity's primary textual content.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct EntityContentKey {
    /// Canonical entity type.
    pub entity_type: EntityType,
    /// Canonical entity identifier.
    pub entity_id: String,
}

/// Object-safe content reader used by the common GraphQL entity edge.
#[async_trait::async_trait]
pub trait EntityContentEdgeReader: Send + Sync + 'static {
    /// Resolve primary textual content for requested entities.
    async fn get_entity_content(
        &self,
        user_id: &MacroUserIdStr<'static>,
        organization_id: Option<i64>,
        keys: Vec<EntityContentKey>,
    ) -> Result<HashMap<EntityContentKey, Option<String>>, rootcause::Report>;
}

/// Request-scoped content loader.
pub struct EntityContentLoader {
    user_id: MacroUserIdStr<'static>,
    organization_id: Option<i64>,
    reader: Arc<dyn EntityContentEdgeReader>,
}

impl EntityContentLoader {
    /// Construct a content loader for one viewer.
    pub fn new(
        user_id: MacroUserIdStr<'static>,
        organization_id: Option<i64>,
        reader: Arc<dyn EntityContentEdgeReader>,
    ) -> Self {
        Self {
            user_id,
            organization_id,
            reader,
        }
    }
}

impl async_graphql::dataloader::Loader<EntityContentKey> for EntityContentLoader {
    type Value = Option<String>;
    type Error = Arc<rootcause::Report>;

    async fn load(
        &self,
        keys: &[EntityContentKey],
    ) -> Result<HashMap<EntityContentKey, Self::Value>, Self::Error> {
        self.reader
            .get_entity_content(&self.user_id, self.organization_id, keys.to_vec())
            .await
            .map_err(Arc::new)
    }
}

/// Build a content DataLoader scoped to the authenticated viewer.
pub fn entity_content_loader(
    user_id: MacroUserIdStr<'static>,
    organization_id: Option<i64>,
    reader: Arc<dyn EntityContentEdgeReader>,
) -> DataLoader<EntityContentLoader> {
    DataLoader::new(
        EntityContentLoader::new(user_id, organization_id, reader),
        tokio::spawn,
    )
}

/// Lazily resolve one entity's primary textual content.
pub async fn load_entity_content(
    ctx: &Context<'_>,
    key: EntityContentKey,
) -> async_graphql::Result<Option<String>> {
    let loader = ctx.data::<DataLoader<EntityContentLoader>>()?;
    Ok(loader.load_one(key).await?.flatten())
}
