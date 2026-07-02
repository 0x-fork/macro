//! Domain models for favorites.

use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Which collection a favorite belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum FavoriteScope {
    /// The requesting user's personal favorites.
    User,
    /// The favorites shared by the requesting user's team.
    Team,
}

/// The owner of a favorites collection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FavoriteOwner<'a> {
    /// A user's personal collection.
    User(MacroUserIdStr<'a>),
    /// A team's shared collection.
    Team(Uuid),
}

impl FavoriteOwner<'_> {
    /// The [FavoriteScope] this owner corresponds to.
    pub fn scope(&self) -> FavoriteScope {
        match self {
            FavoriteOwner::User(_) => FavoriteScope::User,
            FavoriteOwner::Team(_) => FavoriteScope::Team,
        }
    }
}

/// A single favorited entity, including display metadata hydrated from the
/// favorited entity where available.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    /// Unique id of the favorite record.
    pub id: Uuid,
    /// Whether this favorite belongs to the user's or the team's collection.
    pub scope: FavoriteScope,
    /// The type of the favorited entity.
    // Inlined so the shared `EntityType` component name is not claimed in
    // specs that also expose the properties `EntityType` enum.
    #[cfg_attr(feature = "inbound", schema(inline))]
    pub entity_type: EntityType,
    /// The id of the favorited entity.
    pub entity_id: String,
    /// Manual ordering value; lower sorts first.
    pub sort_order: f64,
    /// The user that created the favorite.
    pub created_by: String,
    /// When the favorite was created.
    pub created_at: DateTime<Utc>,
    /// Display name of the favorited entity, when it could be resolved.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// File type of the favorited document, when applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    /// Document sub type (e.g. `task`) of the favorited document, when applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_sub_type: Option<String>,
    /// Channel type (e.g. `public`, `direct_message`) of the favorited channel, when applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_type: Option<String>,
    /// Owning channel id of the favorited channel message, when applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
}

impl Favorite {
    /// The favorited entity as a [model_entity::Entity].
    pub fn entity(&self) -> Entity<'_> {
        self.entity_type.with_entity_str(&self.entity_id)
    }
}

/// The user's favorites together with their team's favorites.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct FavoritesList {
    /// The requesting user's personal favorites, in manual order.
    pub user: Vec<Favorite>,
    /// The requesting user's team favorites, in manual order.
    /// `None` when the user does not belong to a team.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team: Option<Vec<Favorite>>,
}

/// Errors returned by the favorites service.
#[derive(Debug, thiserror::Error)]
pub enum FavoritesError {
    /// The favorite (or entity) could not be found in the owner's collection.
    #[error("favorite not found")]
    NotFound,
    /// The request was invalid.
    #[error("{0}")]
    BadRequest(String),
    /// Any other internal error.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}
