use std::{collections::HashMap, sync::Arc};

use async_graphql::{Context, dataloader::DataLoader};
use favorites::domain::ports::FavoritesService;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;

#[cfg(test)]
mod test;

/// Identity used to resolve whether an entity is favorited by the current viewer.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct EntityFavoriteKey {
    /// Canonical entity type understood by the favorites domain.
    pub entity_type: EntityType,
    /// Entity identifier.
    pub entity_id: String,
}

/// Object-safe favorites reader used by GraphQL entity edges.
#[async_trait::async_trait]
pub trait EntityFavoriteEdgeReader: Send + Sync + 'static {
    /// Resolve favorite state for the requested entities.
    async fn get_entity_favorites(
        &self,
        user_id: &MacroUserIdStr<'static>,
        keys: Vec<EntityFavoriteKey>,
    ) -> Result<HashMap<EntityFavoriteKey, bool>, rootcause::Report>;
}

#[async_trait::async_trait]
impl<T> EntityFavoriteEdgeReader for T
where
    T: FavoritesService,
{
    async fn get_entity_favorites(
        &self,
        user_id: &MacroUserIdStr<'static>,
        keys: Vec<EntityFavoriteKey>,
    ) -> Result<HashMap<EntityFavoriteKey, bool>, rootcause::Report> {
        let entities = keys
            .iter()
            .map(|key| key.entity_type.with_entity_str(&key.entity_id))
            .collect::<Vec<_>>();
        let favorites = self
            .favorited_entities(user_id, &entities)
            .await
            .map_err(|error| rootcause::report!(error))?;

        Ok(keys
            .into_iter()
            .map(|key| {
                let entity = key.entity_type.with_entity_str(&key.entity_id);
                let is_favorited = favorites.contains(&entity);
                (key, is_favorited)
            })
            .collect())
    }
}

/// Request-scoped DataLoader for current-viewer favorite state.
pub struct EntityFavoriteLoader {
    user_id: MacroUserIdStr<'static>,
    reader: Arc<dyn EntityFavoriteEdgeReader>,
}

impl EntityFavoriteLoader {
    /// Construct a favorite loader for one authenticated viewer.
    pub fn new(
        user_id: MacroUserIdStr<'static>,
        reader: Arc<dyn EntityFavoriteEdgeReader>,
    ) -> Self {
        Self { user_id, reader }
    }
}

impl async_graphql::dataloader::Loader<EntityFavoriteKey> for EntityFavoriteLoader {
    type Value = bool;
    type Error = Arc<rootcause::Report>;

    async fn load(
        &self,
        keys: &[EntityFavoriteKey],
    ) -> Result<HashMap<EntityFavoriteKey, Self::Value>, Self::Error> {
        match self
            .reader
            .get_entity_favorites(&self.user_id, keys.to_vec())
            .await
        {
            Ok(favorites) => Ok(favorites),
            Err(error) => {
                // Favorite state is an optional presentation edge. Preserve the
                // REST Soup contract: a favorites outage must not make the
                // underlying entities unavailable.
                tracing::error!(error = ?error, "failed to resolve GraphQL entity favorites");
                Ok(keys.iter().cloned().map(|key| (key, false)).collect())
            }
        }
    }
}

/// Build a favorite DataLoader scoped to the authenticated viewer.
pub fn entity_favorite_loader(
    user_id: MacroUserIdStr<'static>,
    reader: Arc<dyn EntityFavoriteEdgeReader>,
) -> DataLoader<EntityFavoriteLoader> {
    DataLoader::new(EntityFavoriteLoader::new(user_id, reader), tokio::spawn)
}

/// Resolve favorite state from GraphQL request data.
pub async fn load_entity_favorite(
    ctx: &Context<'_>,
    key: EntityFavoriteKey,
) -> async_graphql::Result<bool> {
    let loader = ctx.data::<DataLoader<EntityFavoriteLoader>>()?;
    Ok(loader.load_one(key).await?.unwrap_or(false))
}
