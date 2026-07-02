//! Axum router for favorites endpoints.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRef, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use cowlike::CowLike;
use entity_access::{
    domain::{models::MemberTeamRole, ports::EntityAccessService},
    inbound::axum_extractors::OptionalMacroUserTeamExtractor,
};
use model_entity::EntityType;
use model_error_response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::{
    models::{Favorite, FavoriteOwner, FavoriteScope, FavoritesError, FavoritesList},
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

impl<S, AccessSvc> FromRef<FavoritesRouterState<S, AccessSvc>> for Arc<AccessSvc> {
    fn from_ref(state: &FavoritesRouterState<S, AccessSvc>) -> Self {
        state.access_service.clone()
    }
}

/// Extractor alias for the caller's optional team membership.
type TeamExtractor<AccessSvc> = OptionalMacroUserTeamExtractor<MemberTeamRole, AccessSvc>;

fn team_id_from_receipt<AccessSvc>(team: &TeamExtractor<AccessSvc>) -> Option<Uuid>
where
    AccessSvc: EntityAccessService,
{
    team.entity_access_receipt
        .as_ref()
        .and_then(|receipt| Uuid::parse_str(&receipt.entity().entity_id).ok())
}

/// Resolve the owner for the requested scope, erroring when a team scope is
/// requested without a qualifying team membership.
fn owner_for_scope<'a, AccessSvc>(
    scope: FavoriteScope,
    user: &'a MacroUserExtractor,
    team: &TeamExtractor<AccessSvc>,
) -> Result<FavoriteOwner<'a>, FavoritesApiError>
where
    AccessSvc: EntityAccessService,
{
    match scope {
        FavoriteScope::User => Ok(FavoriteOwner::User(user.macro_user_id.copied())),
        FavoriteScope::Team => team_id_from_receipt(team)
            .map(FavoriteOwner::Team)
            .ok_or(FavoritesApiError::NotInTeam),
    }
}

/// Build the favorites router.
///
/// Routes:
/// - `GET /` — list the caller's favorites and their team's favorites.
/// - `POST /` — favorite an entity in the user or team collection.
/// - `DELETE /{id}` — remove a favorite by id.
/// - `DELETE /` — remove a favorite by entity + scope (query params).
/// - `PATCH /reorder` — persist a manual order for one collection.
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
    /// Which collection to add the favorite to.
    pub scope: FavoriteScope,
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
    /// Which collection to remove the favorite from.
    pub scope: FavoriteScope,
}

/// Request body for reordering a favorites collection.
#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReorderFavoritesRequest {
    /// Which collection to reorder.
    pub scope: FavoriteScope,
    /// The collection's favorite ids in the desired order.
    pub favorite_ids: Vec<Uuid>,
}

/// List the caller's favorites and, when they belong to a team, the team's favorites.
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
    team: TeamExtractor<AccessSvc>,
) -> Result<Json<FavoritesList>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let user_owner = FavoriteOwner::User(user.macro_user_id.copied());
    let team_id = team_id_from_receipt(&team);

    let user_favorites = state.service.list_favorites(&user_owner).await?;
    let team_favorites = match team_id {
        Some(team_id) => Some(
            state
                .service
                .list_favorites(&FavoriteOwner::Team(team_id))
                .await?,
        ),
        None => None,
    };

    Ok(Json(FavoritesList {
        user: user_favorites,
        team: team_favorites,
    }))
}

/// Favorite an entity in the caller's user or team collection.
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
    team: TeamExtractor<AccessSvc>,
    Json(req): Json<AddFavoriteRequest>,
) -> Result<Json<Favorite>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let owner = owner_for_scope(req.scope, &user, &team)?;
    let entity = req.entity_type.with_entity_str(&req.entity_id);
    let favorite = state
        .service
        .add_favorite(&owner, &entity, &user.macro_user_id)
        .await?;
    Ok(Json(favorite))
}

/// Remove a favorite by record id from any collection the caller manages.
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

/// Remove a favorite by entity + scope.
#[utoipa::path(
    delete,
    tag = "favorites",
    operation_id = "remove_favorite_by_entity",
    path = "/favorites",
    params(RemoveFavoriteByEntityParams),
    responses(
        (status = 200, body = ()),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn remove_favorite_by_entity_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    team: TeamExtractor<AccessSvc>,
    Query(params): Query<RemoveFavoriteByEntityParams>,
) -> Result<Json<()>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let owner = owner_for_scope(params.scope, &user, &team)?;
    let entity = params.entity_type.with_entity_str(&params.entity_id);
    state
        .service
        .remove_favorite_by_entity(&owner, &entity)
        .await?;
    Ok(Json(()))
}

/// Persist a manual order for one of the caller's favorites collections.
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
        (status = 403, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn reorder_favorites_handler<S, AccessSvc>(
    State(state): State<FavoritesRouterState<S, AccessSvc>>,
    user: MacroUserExtractor,
    team: TeamExtractor<AccessSvc>,
    Json(req): Json<ReorderFavoritesRequest>,
) -> Result<Json<()>, FavoritesApiError>
where
    S: FavoritesService,
    AccessSvc: EntityAccessService,
{
    let owner = owner_for_scope(req.scope, &user, &team)?;
    state
        .service
        .reorder_favorites(&owner, &req.favorite_ids)
        .await?;
    Ok(Json(()))
}

/// API-level error for favorites handlers.
#[derive(Debug, thiserror::Error)]
pub enum FavoritesApiError {
    /// A team-scoped operation was requested by a user without a team.
    #[error("you are not a member of a team")]
    NotInTeam,
    /// Domain error.
    #[error(transparent)]
    Favorites(#[from] FavoritesError),
}

impl IntoResponse for FavoritesApiError {
    fn into_response(self) -> axum::response::Response {
        let status_code = match &self {
            FavoritesApiError::NotInTeam => StatusCode::FORBIDDEN,
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
