//! Shared plumbing for the domain GraphQL adapter crates: request-scoped
//! extractor context, filter-input conversion helpers, and cross-domain
//! schema types.
#![deny(missing_docs)]
#![deny(clippy::missing_docs_in_private_items)]

// Re-exported for use by the `filter_expr_input!` macro expansion.
pub use filter_ast;

/// GraphQL authorization helpers.
mod authorization;
/// Shared GraphQL entity-type mappings.
mod entity_type;
/// Axum request-parts extraction helpers for GraphQL resolvers.
mod extract;
/// Lazy favorite-state edge loading.
mod favorite;
/// GraphQL filter-input conversion helpers.
mod filter_input;
/// Lazy entity-permission edge loading and schema types.
mod permission;
/// Property-filter GraphQL input types.
mod property_filter;
/// Request-scoped context used by GraphQL resolvers.
mod request_context;

pub use authorization::require_authorized_user;
pub use entity_type::{GraphqlEntityType, GraphqlSoupEntityType};
pub use extract::extract_part;
pub use favorite::{
    EntityFavoriteEdgeReader, EntityFavoriteKey, EntityFavoriteLoader, entity_favorite_loader,
    load_entity_favorite,
};
pub use filter_input::{IntoFilterExpr, optional_tree, parse_id, parse_macro_user_id, parse_uuid};
pub use permission::{
    EntityPermissionEdgeReader, EntityPermissionKey, EntityPermissionLoader,
    GraphqlChannelParticipantRole, GraphqlEntityAccessLevel, GraphqlEntityPermission,
    GraphqlEntityPermissionKind, GraphqlTeamRole, entity_permission_loader, load_entity_permission,
};
pub use property_filter::{
    GraphqlPropertiesBinaryExpr, GraphqlPropertiesExpr, GraphqlPropertiesLiteral,
    GraphqlPropertyEntityType, GraphqlPropertyMatchValue,
};
pub use request_context::GraphqlRequestParts;
