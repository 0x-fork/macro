use crate::api::context::ApiContext;
use axum::extract::State;
use axum::{Extension, Json, http::StatusCode, response::IntoResponse};
use chrono::{DateTime, Utc};
use model::response::{GenericErrorResponse, GenericResponse};
use model::user::UserContext;
use uuid::Uuid;

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct CreateReminderRequest {
    pub entity_type: String,
    pub entity_id: Uuid,
    pub reminder_time: DateTime<Utc>,
}

/// Creates a new reminder for the authenticated user
#[utoipa::path(
    post,
    path = "/reminders",
    request_body = CreateReminderRequest,
    responses(
        (status = 201),
        (status = 400, body = GenericErrorResponse),
        (status = 401, body = GenericErrorResponse),
        (status = 500, body = GenericErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context, body), fields(user_id=?user_context.user_id))]
pub async fn create_reminder_handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
    Json(body): Json<CreateReminderRequest>,
) -> impl IntoResponse {
    match macro_db_client::reminders::create_reminder(
        &ctx.db,
        &user_context.user_id,
        &body.entity_type,
        body.entity_id,
        body.reminder_time,
    )
    .await
    {
        Ok(reminder) => GenericResponse::builder()
            .data(&reminder)
            .send(StatusCode::CREATED),
        Err(e) => {
            tracing::error!(error=?e, "unable to create reminder");
            GenericResponse::builder()
                .message("unable to create reminder")
                .is_error(true)
                .send(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
