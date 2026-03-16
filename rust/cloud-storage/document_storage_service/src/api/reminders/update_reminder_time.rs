use crate::api::context::ApiContext;
use axum::extract::{Path, State};
use axum::{Extension, Json, http::StatusCode, response::IntoResponse};
use chrono::{DateTime, Utc};
use model::response::{GenericErrorResponse, GenericResponse};
use model::user::UserContext;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct Params {
    pub reminder_id: Uuid,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct UpdateReminderTimeRequest {
    pub reminder_time: DateTime<Utc>,
}

/// Updates the reminder time of an existing reminder
#[utoipa::path(
    put,
    path = "/reminders/{reminder_id}/time",
    params(
        ("reminder_id" = Uuid, Path, description = "ID of the reminder")
    ),
    request_body = UpdateReminderTimeRequest,
    responses(
        (status = 200),
        (status = 400, body = GenericErrorResponse),
        (status = 401, body = GenericErrorResponse),
        (status = 404, body = GenericErrorResponse),
        (status = 500, body = GenericErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context, body), fields(user_id=?user_context.user_id))]
pub async fn update_reminder_time_handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
    Path(Params { reminder_id }): Path<Params>,
    Json(body): Json<UpdateReminderTimeRequest>,
) -> impl IntoResponse {
    match macro_db_client::reminders::update_reminder_time(
        &ctx.db,
        reminder_id,
        &user_context.user_id,
        body.reminder_time,
    )
    .await
    {
        Ok(reminder) => GenericResponse::builder()
            .data(&reminder)
            .send(StatusCode::OK),
        Err(macro_db_client::reminders::UpdateReminderTimeError::NotFound) => {
            GenericResponse::builder()
                .message("reminder not found")
                .is_error(true)
                .send(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            tracing::error!(error=?e, "unable to update reminder time");
            GenericResponse::builder()
                .message("unable to update reminder time")
                .is_error(true)
                .send(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
