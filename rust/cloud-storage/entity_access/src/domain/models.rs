//! Domain models for entity access.

use std::marker::PhantomData;

use macro_user_id::user_id::MacroUserIdStr;
use serde::{Deserialize, Serialize};

pub use model_entity::EntityType;
pub use models_permissions::share_permission::access_level::AccessLevel;
pub use models_permissions::share_permission::access_level::{
    CommentAccessLevel, EditAccessLevel, OwnerAccessLevel, ViewAccessLevel,
};

/// The role a user has within a channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum ParticipantRole {
    /// Channel owner with full control.
    Owner,
    /// Channel administrator.
    Admin,
    /// Regular channel member.
    #[default]
    Member,
}

/// Channel owner role with full control
#[derive(Debug)]
pub struct OwnerParticipantRole;

/// Channel Administrator
#[derive(Debug)]
pub struct AdminParticipantRole;

/// Regular channel member.
#[derive(Debug)]
pub struct MemberParticipantRole;

/// Trait implemented by marker types that encode a permission requirement.
pub trait RequiredPermission: std::fmt::Debug + Send + Sync + 'static {
    /// Returns whether the provided permission satisfies this requirement.
    fn is_satisfied_by(permission: &EntityPermission) -> bool;
}

/// Marker trait implemented by types that encode an entity kind for a receipt.
pub trait EntityKind: std::fmt::Debug + Send + Sync + 'static {
    /// Returns true if the provided entity type is valid for this kind.
    fn matches(entity_type: EntityType) -> bool;
}

/// Receipt kind for an arbitrary entity.
#[derive(Debug)]
pub struct AnyEntity;

/// Receipt kind for documents.
#[derive(Debug)]
pub struct DocumentEntity;

/// Receipt kind for chats.
#[derive(Debug)]
pub struct ChatEntity;

/// Receipt kind for projects.
#[derive(Debug)]
pub struct ProjectEntity;

/// Receipt kind for email threads.
#[derive(Debug)]
pub struct EmailThreadEntity;

/// Receipt kind for channels.
#[derive(Debug)]
pub struct ChannelEntity;

impl EntityKind for AnyEntity {
    fn matches(_: EntityType) -> bool {
        true
    }
}

impl EntityKind for DocumentEntity {
    fn matches(entity_type: EntityType) -> bool {
        entity_type == EntityType::Document
    }
}

impl EntityKind for ChatEntity {
    fn matches(entity_type: EntityType) -> bool {
        entity_type == EntityType::Chat
    }
}

impl EntityKind for ProjectEntity {
    fn matches(entity_type: EntityType) -> bool {
        entity_type == EntityType::Project
    }
}

impl EntityKind for EmailThreadEntity {
    fn matches(entity_type: EntityType) -> bool {
        entity_type == EntityType::EmailThread
    }
}

impl EntityKind for ChannelEntity {
    fn matches(entity_type: EntityType) -> bool {
        entity_type == EntityType::Channel
    }
}

/// A user's permission for an entity, discriminated by entity kind.
///
/// Items (documents, chats, projects, threads) use access levels.
/// Channels use participant roles.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EntityPermission {
    /// Permission for item-based entities (document, chat, project, thread).
    AccessLevel {
        /// The access level the user has.
        access_level: AccessLevel,
    },
    /// Permission for channel-based entities.
    ChannelRole {
        /// The role the user has in the channel.
        role: ParticipantRole,
    },
}

impl EntityPermission {
    /// Returns whether this permission grants at least the requested access level.
    pub fn allows_access_level(&self, required: AccessLevel) -> bool {
        matches!(
            self,
            EntityPermission::AccessLevel { access_level } if *access_level >= required
        )
    }

    /// Returns whether this permission grants at least the requested channel role.
    pub fn allows_participant_role(&self, required: ParticipantRole) -> bool {
        matches!(
            (self, required),
            (
                EntityPermission::ChannelRole {
                    role: ParticipantRole::Owner,
                },
                ParticipantRole::Owner,
            ) | (
                EntityPermission::ChannelRole {
                    role: ParticipantRole::Owner | ParticipantRole::Admin,
                },
                ParticipantRole::Admin,
            ) | (
                EntityPermission::ChannelRole {
                    role: ParticipantRole::Owner | ParticipantRole::Admin | ParticipantRole::Member,
                },
                ParticipantRole::Member
            )
        )
    }

    /// Returns whether this permission satisfies the provided marker type.
    pub fn satisfies<T: RequiredPermission>(&self) -> bool {
        T::is_satisfied_by(self)
    }
}

impl RequiredPermission for ViewAccessLevel {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_access_level(AccessLevel::View)
    }
}

impl RequiredPermission for CommentAccessLevel {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_access_level(AccessLevel::Comment)
    }
}

impl RequiredPermission for EditAccessLevel {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_access_level(AccessLevel::Edit)
    }
}

impl RequiredPermission for OwnerAccessLevel {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_access_level(AccessLevel::Owner)
    }
}

impl RequiredPermission for OwnerParticipantRole {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_participant_role(ParticipantRole::Owner)
    }
}

impl RequiredPermission for AdminParticipantRole {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_participant_role(ParticipantRole::Admin)
    }
}

impl RequiredPermission for MemberParticipantRole {
    fn is_satisfied_by(permission: &EntityPermission) -> bool {
        permission.allows_participant_role(ParticipantRole::Member)
    }
}

/// Result of resolving a user's role in a channel.
///
/// Distinguishes between "user has a role", "channel exists but user
/// has no access", and "channel does not exist" — all from a single query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelRoleResult {
    /// User has a role in the channel.
    Role(ParticipantRole),
    /// Channel exists but user has no access.
    NoAccess,
    /// Channel does not exist.
    NotFound,
}

/// A given entity
#[derive(Debug, Clone)]
pub struct Entity {
    /// The id of the entity
    pub entity_id: String,
    /// The type of the entity
    pub entity_type: EntityType,
}

/// The entity access auth type
#[derive(Debug, Clone, serde::Serialize)]
#[serde(untagged)]
pub enum EntityAccessAuth {
    /// The user is authenticated
    Authenticated(MacroUserIdStr<'static>),
    /// The user is unauthenticated
    Unauthenticated,
    /// Internally authenticated
    Internal,
}

/// Represents that a given user has a given permission for the provided id.
///
/// The type parameter `T` encodes the minimum permission that was verified
/// when this receipt was created.
#[derive(Debug, Clone)]
pub struct EntityAccessReceipt<K: EntityKind, T: RequiredPermission> {
    /// The entity access authentication method
    pub(crate) auth: EntityAccessAuth,
    /// The entity that was requested access
    pub(crate) entity: Entity,
    /// The permission for the user on the entity
    pub(crate) entity_permission: EntityPermission,
    /// Phantom data to carry the entity and permission types.
    pub(crate) _marker: PhantomData<(K, T)>,
}

/// Receipt alias for document access.
pub type DocumentAccessReceipt<T> = EntityAccessReceipt<DocumentEntity, T>;

/// Receipt alias for chat access.
pub type ChatAccessReceipt<T> = EntityAccessReceipt<ChatEntity, T>;

/// Receipt alias for project access.
pub type ProjectAccessReceipt<T> = EntityAccessReceipt<ProjectEntity, T>;

/// Receipt alias for thread access.
pub type ThreadAccessReceipt<T> = EntityAccessReceipt<EmailThreadEntity, T>;

/// Receipt alias for channel access.
pub type ChannelAccessReceipt<T> = EntityAccessReceipt<ChannelEntity, T>;

impl<K: EntityKind, T: RequiredPermission> EntityAccessReceipt<K, T> {
    /// Getter for auth
    pub fn auth(&self) -> &EntityAccessAuth {
        &self.auth
    }

    /// Getter for entity
    pub fn entity(&self) -> &Entity {
        &self.entity
    }

    /// Getter for entity permission
    pub fn entity_permission(&self) -> &EntityPermission {
        &self.entity_permission
    }

    /// Rebind this receipt to a different entity kind after validating the stored entity type.
    pub fn try_into_kind<K2: EntityKind>(self) -> Result<EntityAccessReceipt<K2, T>, AccessError> {
        if !K2::matches(self.entity.entity_type) {
            return Err(AccessError::BadRequest("Invalid receipt entity type"));
        }

        Ok(EntityAccessReceipt {
            auth: self.auth,
            entity: self.entity,
            entity_permission: self.entity_permission,
            _marker: PhantomData,
        })
    }
}

impl<T: RequiredPermission> EntityAccessReceipt<AnyEntity, T> {
    /// Dangerously generates a EntityAccessReceipt for an internal user
    /// **NOTE** This should only be used in specific circumstances and not as a way
    /// to circumvent AI tool permissioning
    /// This **DOES NOT** assert the existence of the item
    pub fn dangerously_assert_internal_user(
        entity_id: &str,
        entity_type: EntityType,
    ) -> EntityAccessReceipt<AnyEntity, T> {
        let entity_permission = match entity_type {
            EntityType::Channel => EntityPermission::ChannelRole {
                role: ParticipantRole::Owner,
            },
            _ => EntityPermission::AccessLevel {
                access_level: AccessLevel::Owner,
            },
        };

        EntityAccessReceipt {
            auth: EntityAccessAuth::Internal,
            entity: Entity {
                entity_id: entity_id.to_string(),
                entity_type,
            },
            entity_permission,
            _marker: PhantomData,
        }
    }
}

impl<T: RequiredPermission> DocumentAccessReceipt<T> {
    /// Getter for the validated document id.
    pub fn document_id(&self) -> &str {
        &self.entity.entity_id
    }
}

impl<T: RequiredPermission> ProjectAccessReceipt<T> {
    /// Getter for the validated project id.
    pub fn project_id(&self) -> &str {
        &self.entity.entity_id
    }
}

impl<T: RequiredPermission> ChatAccessReceipt<T> {
    /// Getter for the validated chat id.
    pub fn chat_id(&self) -> &str {
        &self.entity.entity_id
    }
}

impl<T: RequiredPermission> ThreadAccessReceipt<T> {
    /// Getter for the validated thread id as a UUID.
    pub fn thread_id(&self) -> Result<uuid::Uuid, AccessError> {
        uuid::Uuid::parse_str(&self.entity.entity_id)
            .map_err(|_| AccessError::BadRequest("Invalid thread ID format"))
    }
}

impl<T: RequiredPermission> ChannelAccessReceipt<T> {
    /// Getter for the validated channel id as a UUID.
    pub fn channel_id(&self) -> Result<uuid::Uuid, AccessError> {
        uuid::Uuid::parse_str(&self.entity.entity_id)
            .map_err(|_| AccessError::BadRequest("Invalid channel ID format"))
    }
}

/// Errors that can occur during access checking.
#[derive(Debug, thiserror::Error)]
pub enum AccessError {
    /// User does not have access to the requested resource.
    #[error("User does not have access to the requested resource")]
    Unauthorized,

    /// User does not have access with a specific message.
    #[error("{0}")]
    UnauthorizedWithMessage(&'static str),

    /// Database error during access check.
    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    /// Bad request parameters.
    #[error("Bad request: {0}")]
    BadRequest(&'static str),

    /// Requested resource was not found.
    #[error("Not found: {0}")]
    NotFound(&'static str),

    /// Internal server error.
    #[error("Internal error")]
    Internal,
}
