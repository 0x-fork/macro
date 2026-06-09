//! HTTP layer for the calendar service.

use std::sync::Arc;

use crate::domain::models::{
    Attendee, AttendeeInput, CalendarEvent, CreateEventRequest, InviteRequest, UpdateEventRequest,
};
use crate::domain::ports::CalendarService;
use axum::Router;
use axum::extract::{Json, Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use model_user::axum_extractor::MacroUserExtractor;
use serde::Deserialize;
use tracing::instrument;
use utoipa::{IntoParams, OpenApi};

/// Query parameters for `GET /calendar/events`.
#[derive(Debug, Deserialize, IntoParams)]
pub struct ListQuery {
    /// Window start instant (epoch-millis). Events ending after this are returned.
    pub start_ms: i64,
    /// Window end instant (epoch-millis). Events starting before this are returned.
    pub end_ms: i64,
}

/// Maps a repository error to a 500 while logging the cause.
fn internal(error: rootcause::Report) -> StatusCode {
    tracing::error!(error = ?error, "calendar repository error");
    StatusCode::INTERNAL_SERVER_ERROR
}

/// GET /calendar/events
#[utoipa::path(
    get,
    tag = "calendar",
    operation_id = "list_events",
    path = "/calendar/events",
    params(ListQuery),
    responses(
        (status = 200, body = Vec<CalendarEvent>),
        (status = 401, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id), fields(user_id = macro_user_id.as_ref()))]
pub async fn list_events_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<CalendarEvent>>, StatusCode> {
    let events = service
        .list_events(macro_user_id.as_ref(), query.start_ms, query.end_ms)
        .await
        .map_err(internal)?;
    Ok(Json(events))
}

/// POST /calendar/events
#[utoipa::path(
    post,
    tag = "calendar",
    operation_id = "create_event",
    path = "/calendar/events",
    request_body = CreateEventRequest,
    responses(
        (status = 200, body = CalendarEvent),
        (status = 401, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id, body), fields(user_id = macro_user_id.as_ref()))]
pub async fn create_event_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Json(body): Json<CreateEventRequest>,
) -> Result<Json<CalendarEvent>, StatusCode> {
    let event = service
        .create_event(macro_user_id.as_ref(), body)
        .await
        .map_err(internal)?;
    Ok(Json(event))
}

/// GET /calendar/events/{id}
#[utoipa::path(
    get,
    tag = "calendar",
    operation_id = "get_event",
    path = "/calendar/events/{id}",
    params(("id" = String, Path, description = "Event id")),
    responses(
        (status = 200, body = CalendarEvent),
        (status = 401, body = String),
        (status = 404, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id), fields(user_id = macro_user_id.as_ref()))]
pub async fn get_event_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Path(id): Path<String>,
) -> Result<Json<CalendarEvent>, StatusCode> {
    service
        .get_event(macro_user_id.as_ref(), &id)
        .await
        .map_err(internal)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

/// PUT /calendar/events/{id}
#[utoipa::path(
    put,
    tag = "calendar",
    operation_id = "update_event",
    path = "/calendar/events/{id}",
    params(("id" = String, Path, description = "Event id")),
    request_body = CreateEventRequest,
    responses(
        (status = 200, body = CalendarEvent),
        (status = 401, body = String),
        (status = 404, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id, body), fields(user_id = macro_user_id.as_ref()))]
pub async fn update_event_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Path(id): Path<String>,
    Json(body): Json<UpdateEventRequest>,
) -> Result<Json<CalendarEvent>, StatusCode> {
    service
        .update_event(macro_user_id.as_ref(), &id, body)
        .await
        .map_err(internal)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

/// DELETE /calendar/events/{id}
#[utoipa::path(
    delete,
    tag = "calendar",
    operation_id = "delete_event",
    path = "/calendar/events/{id}",
    params(("id" = String, Path, description = "Event id")),
    responses(
        (status = 204),
        (status = 401, body = String),
        (status = 404, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id), fields(user_id = macro_user_id.as_ref()))]
pub async fn delete_event_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let removed = service
        .delete_event(macro_user_id.as_ref(), &id)
        .await
        .map_err(internal)?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

/// POST /calendar/events/{id}/invite
///
/// Records that the given attendees were invited (the actual email is sent
/// from the client through the user's connected mailbox). Returns the updated
/// event so the UI can reflect invite timestamps.
#[utoipa::path(
    post,
    tag = "calendar",
    operation_id = "invite_attendees",
    path = "/calendar/events/{id}/invite",
    params(("id" = String, Path, description = "Event id")),
    request_body = InviteRequest,
    responses(
        (status = 200, body = CalendarEvent),
        (status = 401, body = String),
        (status = 404, body = String),
        (status = 500, body = String)
    )
)]
#[instrument(skip(service, macro_user_id, body), fields(user_id = macro_user_id.as_ref()))]
pub async fn invite_handler<S: CalendarService>(
    State(service): State<Arc<S>>,
    MacroUserExtractor { macro_user_id, .. }: MacroUserExtractor,
    Path(id): Path<String>,
    Json(body): Json<InviteRequest>,
) -> Result<Json<CalendarEvent>, StatusCode> {
    service
        .mark_invited(macro_user_id.as_ref(), &id, body.emails)
        .await
        .map_err(internal)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

/// Application state for the calendar HTTP service.
pub struct AppState<S> {
    /// JWT validation arguments for the auth middleware.
    pub jwt_args: macro_auth::middleware::decode_jwt::JwtValidationArgs,
    /// The calendar service instance.
    pub calendar_service: Arc<S>,
}

/// Builds the calendar routes (without auth middleware).
pub fn calendar_router<S: CalendarService>() -> Router<Arc<S>> {
    Router::new()
        .route(
            "/calendar/events",
            get(list_events_handler::<S>).post(create_event_handler::<S>),
        )
        .route(
            "/calendar/events/{id}",
            get(get_event_handler::<S>)
                .put(update_event_handler::<S>)
                .delete(delete_event_handler::<S>),
        )
        .route("/calendar/events/{id}/invite", post(invite_handler::<S>))
}

/// Builds the full API router with JWT auth middleware applied.
pub fn api_router<S: CalendarService>(app_state: AppState<S>) -> Router {
    calendar_router::<S>()
        .layer(axum::middleware::from_fn_with_state(
            app_state.jwt_args.clone(),
            macro_middleware::auth::decode_jwt::handler,
        ))
        .with_state(app_state.calendar_service)
}

/// OpenAPI documentation for the calendar service.
#[derive(OpenApi)]
#[openapi(
    info(terms_of_service = "https://macro.com/terms"),
    paths(
        list_events_handler,
        create_event_handler,
        get_event_handler,
        update_event_handler,
        delete_event_handler,
        invite_handler,
    ),
    components(schemas(
        CalendarEvent,
        Attendee,
        AttendeeInput,
        CreateEventRequest,
        InviteRequest,
    )),
    tags((name = "calendar", description = "Macro Calendar Service"))
)]
pub struct ApiDoc;
