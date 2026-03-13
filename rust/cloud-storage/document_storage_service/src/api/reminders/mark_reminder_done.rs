use crate::api::context::ApiContext;
use axum::extract::{Path, State};
use axum::{Extension, http::StatusCode, response::IntoResponse};
use model::response::{
    GenericErrorResponse, GenericResponse, GenericSuccessResponse, SuccessResponse,
};
use model::user::UserContext;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct Params {
    pub reminder_id: Uuid,
}

/// Marks a reminder as done
#[utoipa::path(
    put,
    path = "/reminders/{reminder_id}/done",
    params(
        ("reminder_id" = Uuid, Path, description = "ID of the reminder")
    ),
    responses(
        (status = 200, body = SuccessResponse),
        (status = 400, body = GenericErrorResponse),
        (status = 401, body = GenericErrorResponse),
        (status = 404, body = GenericErrorResponse),
        (status = 500, body = GenericErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=?user_context.user_id))]
pub async fn mark_reminder_done_handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
    Path(Params { reminder_id }): Path<Params>,
) -> impl IntoResponse {
    match macro_db_client::reminders::mark_reminder_done(
        &ctx.db,
        reminder_id,
        &user_context.user_id,
    )
    .await
    {
        Ok(()) => GenericResponse::builder()
            .data(&GenericSuccessResponse { success: true })
            .send(StatusCode::OK),
        Err(macro_db_client::reminders::MarkReminderDoneError::NotFound) => {
            GenericResponse::builder()
                .message("reminder not found or already done")
                .is_error(true)
                .send(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            tracing::error!(error=?e, "unable to mark reminder done");
            GenericResponse::builder()
                .message("unable to mark reminder done")
                .is_error(true)
                .send(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
