//! Axum router for favorites endpoints.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use entity_access::domain::ports::EntityAccessService;
use model_entity::EntityType;
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::{
    models::{Favorite, FavoritesError, FavoritesList},
    ports::FavoritesService,
};

/// Router state for favorites endpoints.
pub struct FavoritesRouterState<S, AccessSvc> {
    service: Arc<S>,
    access_service: Arc<AccessSvc>,
}

impl<S, AccessSvc> Clone for FavoritesRouterState<S, AccessSvc> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            access_service: self.access_service.clone(),
        }
    }
}

impl<S, AccessSvc> FavoritesRouterState<S, AccessSvc>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    /// Create router state from shared service references.
    pub fn new(service: Arc<S>, access_service: Arc<AccessSvc>) -> Self {
        Self {
            service,
            access_service,
        }
    }
}

/// Ensure the caller has at least view access to the entity they are trying
/// to favorite.
///
/// Favorites hydrate display metadata (names, email subjects, channel types)
/// on read, so without this check a caller could favorite an arbitrary id and
/// use `GET /favorites` as an oracle for entities they cannot see. Entity
/// types the access layer does not recognize (e.g. channel messages) resolve
/// to "no access" and are rejected.
async fn ensure_entity_access<AccessSvc>(
    access_service: &AccessSvc,
    user: &MacroUserExtractor,
    entity_type: EntityType,
    entity_id: &str,
) -> Result<(), FavoritesApiError>
where
    AccessSvc: EntityAccessService,
{
    let access = access_service
        .get_access_level(Some(&user.macro_user_id), entity_id, entity_type)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "favorites: failed to check entity access");
            FavoritesApiError::Favorites(FavoritesError::Internal(anyhow::anyhow!(
                "failed to check entity access"
            )))
        })?;
    if access.is_some() {
        Ok(())
    } else {
        Err(FavoritesApiError::Forbidden)
    }
}

/// Build the favorites router.
///
/// Routes:
/// - `GET /` — list the caller's favorites.
/// - `POST /` — favorite an entity.
/// - `DELETE /{id}` — remove a favorite by id.
/// - `DELETE /` — remove a favorite by entity (query params).
/// - `PATCH /reorder` — persist a manual order.
pub fn favorites_router<S, AccessSvc, T>(state: FavoritesRouterState<S, AccessSvc>) -> Router<T>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
    T: Send + Sync + 'static,
{
    Router::new()
        .route("/", get(list_favorites_handler::<S, AccessSvc>))
        .route("/", post(add_favorite_handler::<S, AccessSvc>))
        .route(
            "/",
            delete(remove_favorite_by_entity_handler::<S, AccessSvc>),
        )
        .route("/{id}", delete(remove_favorite_handler::<S, AccessSvc>))
        .route("/reorder", patch(reorder_favorites_handler::<S, AccessSvc>))
        .with_state(state)
}

/// Request body for favoriting an entity.
#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddFavoriteRequest {
    /// The type of the entity to favorite.
    // Inlined to avoid claiming the shared `EntityType` component name (see
    // `Favorite::entity_type`).
    #[schema(inline)]
    pub entity_type: EntityType,
    /// The id of the entity to favorite.
    pub entity_id: String,
}

/// Query params for removing a favorite by entity.
#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct RemoveFavoriteByEntityParams {
    /// The type of the favorited entity.
    #[param(inline)]
    pub entity_type: EntityType,
    /// The id of the favorited entity.
    pub entity_id: String,
}

/// Request body for reordering favorites.
#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReorderFavoritesRequest {
    /// The favorite ids in the desired order.
    pub favorite_ids: Vec<Uuid>,
}

/// List the caller's favorites.
#[utoipa::path(
    get,
    tag = "favorites",
    operation_id = "list_favorites",
    path = "/favorites",
    responses(
        (status = 200, body = FavoritesList),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn list_favorites_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
) -> Result<Json<FavoritesList>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let favorites = state.service.list_favorites(&user.macro_user_id).await?;
    Ok(Json(FavoritesList { favorites }))
}

/// Favorite an entity in the caller's collection.
#[utoipa::path(
    post,
    tag = "favorites",
    operation_id = "add_favorite",
    path = "/favorites",
    request_body = AddFavoriteRequest,
    responses(
        (status = 200, body = Favorite),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn add_favorite_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    Json(req): Json<AddFavoriteRequest>,
) -> Result<Json<Favorite>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    // Only let the caller favorite entities they can actually access, so a
    // favorite can't be used as an oracle for entity metadata (name, subject,
    // private-channel type) they were never allowed to see.
    ensure_entity_access(
        state.access_service.as_ref(),
        &user,
        req.entity_type,
        &req.entity_id,
    )
    .await?;
    let entity = req.entity_type.with_entity_str(&req.entity_id);
    let favorite = state
        .service
        .add_favorite(&user.macro_user_id, &entity)
        .await?;
    Ok(Json(favorite))
}

/// Remove a favorite by record id from the caller's collection.
#[utoipa::path(
    delete,
    tag = "favorites",
    operation_id = "remove_favorite",
    path = "/favorites/{id}",
    params(("id" = Uuid, Path, description = "Favorite record id")),
    responses(
        (status = 200, body = ()),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn remove_favorite_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    Path(id): Path<Uuid>,
) -> Result<Json<()>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    state
        .service
        .remove_favorite_by_id(&user.macro_user_id, id)
        .await?;
    Ok(Json(()))
}

/// Remove a favorite by entity.
#[utoipa::path(
    delete,
    tag = "favorites",
    operation_id = "remove_favorite_by_entity",
    path = "/favorites",
    params(RemoveFavoriteByEntityParams),
    responses(
        (status = 200, body = ()),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn remove_favorite_by_entity_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    Query(params): Query<RemoveFavoriteByEntityParams>,
) -> Result<Json<()>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let entity = params.entity_type.with_entity_str(&params.entity_id);
    state
        .service
        .remove_favorite_by_entity(&user.macro_user_id, &entity)
        .await?;
    Ok(Json(()))
}

/// Persist a manual order for the caller's favorites.
#[utoipa::path(
    patch,
    tag = "favorites",
    operation_id = "reorder_favorites",
    path = "/favorites/reorder",
    request_body = ReorderFavoritesRequest,
    responses(
        (status = 200, body = ()),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn reorder_favorites_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    Json(req): Json<ReorderFavoritesRequest>,
) -> Result<Json<()>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    state
        .service
        .reorder_favorites(&user.macro_user_id, &req.favorite_ids)
        .await?;
    Ok(Json(()))
}

/// API-level error for favorites handlers.
#[derive(Debug, thiserror::Error)]
pub enum FavoritesApiError {
    /// The caller does not have access to the entity they tried to favorite.
    #[error("you do not have access to this entity")]
    Forbidden,
    /// Domain error.
    #[error(transparent)]
    Favorites(#[from] FavoritesError),
}

impl IntoResponse for FavoritesApiError {
    fn into_response(self) -> axum::response::Response {
        let status_code = match &self {
            FavoritesApiError::Forbidden => StatusCode::FORBIDDEN,
            FavoritesApiError::Favorites(FavoritesError::NotFound) => StatusCode::NOT_FOUND,
            FavoritesApiError::Favorites(FavoritesError::BadRequest(_)) => StatusCode::BAD_REQUEST,
            FavoritesApiError::Favorites(FavoritesError::Internal(_)) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };

        if status_code.is_server_error() {
            tracing::error!(error=?self, "favorites internal server error");
        }

        let message = match &self {
            FavoritesApiError::Favorites(FavoritesError::Internal(_)) => {
                "internal server error".to_string()
            }
            error => error.to_string(),
        };

        (
            status_code,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}
