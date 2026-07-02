//! Ports (trait contracts) for the favorites domain.

use std::collections::HashSet;

use macro_user_id::user_id::MacroUserIdStr;
use model_entity::Entity;
use uuid::Uuid;

use crate::domain::models::{Favorite, FavoriteOwner, FavoritesError};

/// Outbound persistence port for favorites.
pub trait FavoritesRepo: Send + Sync + 'static {
    /// The error type returned by repository operations.
    type Err: Send + std::fmt::Debug;

    /// Insert a favorite at the end of the owner's collection.
    ///
    /// Adding an entity that is already favorited by the owner is a no-op
    /// that returns the existing record.
    fn add_favorite(
        &self,
        owner: &FavoriteOwner<'_>,
        entity: &Entity<'_>,
        created_by: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Favorite, Self::Err>> + Send;

    /// Count the favorites currently in the owner's collection.
    fn count_favorites(
        &self,
        owner: &FavoriteOwner<'_>,
    ) -> impl Future<Output = Result<i64, Self::Err>> + Send;

    /// List the owner's favorites in manual order, hydrated with display
    /// metadata. Favorites pointing at deleted entities are omitted.
    fn list_favorites(
        &self,
        owner: &FavoriteOwner<'_>,
    ) -> impl Future<Output = Result<Vec<Favorite>, Self::Err>> + Send;

    /// Remove a favorite by record id from any collection the user may
    /// manage (their own, or their team's).
    ///
    /// Returns `true` when a row was removed.
    fn remove_favorite_by_id(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<bool, Self::Err>> + Send;

    /// Remove the favorite for the given entity from the owner's collection.
    ///
    /// Returns `true` when a row was removed.
    fn remove_favorite_by_entity(
        &self,
        owner: &FavoriteOwner<'_>,
        entity: &Entity<'_>,
    ) -> impl Future<Output = Result<bool, Self::Err>> + Send;

    /// Persist a manual ordering for the owner's favorites. `ordered_ids`
    /// is the full list of the owner's favorite ids in the desired order;
    /// ids that do not belong to the owner are ignored.
    fn reorder_favorites(
        &self,
        owner: &FavoriteOwner<'_>,
        ordered_ids: &[Uuid],
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;

    /// Of the given entities, return the subset that is favorited by the
    /// user personally or by the user's team.
    fn favorited_entities(
        &self,
        user_id: &MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> impl Future<Output = Result<HashSet<Entity<'static>>, Self::Err>> + Send;
}

/// Inbound service port: the favorites API used by drivers (HTTP, soup enrichment).
pub trait FavoritesService: Send + Sync + 'static {
    /// Add an entity to the owner's favorites (idempotent).
    fn add_favorite(
        &self,
        owner: &FavoriteOwner<'_>,
        entity: &Entity<'_>,
        created_by: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Favorite, FavoritesError>> + Send;

    /// List the owner's favorites in manual order.
    fn list_favorites(
        &self,
        owner: &FavoriteOwner<'_>,
    ) -> impl Future<Output = Result<Vec<Favorite>, FavoritesError>> + Send;

    /// Remove a favorite by record id from any collection the user manages.
    fn remove_favorite_by_id(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: Uuid,
    ) -> impl Future<Output = Result<(), FavoritesError>> + Send;

    /// Remove the favorite for the given entity from the owner's collection.
    fn remove_favorite_by_entity(
        &self,
        owner: &FavoriteOwner<'_>,
        entity: &Entity<'_>,
    ) -> impl Future<Output = Result<(), FavoritesError>> + Send;

    /// Persist a manual ordering for the owner's favorites.
    fn reorder_favorites(
        &self,
        owner: &FavoriteOwner<'_>,
        ordered_ids: &[Uuid],
    ) -> impl Future<Output = Result<(), FavoritesError>> + Send;

    /// Of the given entities, return the subset favorited by the user or
    /// the user's team.
    fn favorited_entities(
        &self,
        user_id: &MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> impl Future<Output = Result<HashSet<Entity<'static>>, FavoritesError>> + Send;
}
