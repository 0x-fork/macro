use crate::api::context::ApiContext;
use axum::extract::State;
use axum::{Extension, http::StatusCode, response::IntoResponse};
use model::response::{GenericErrorResponse, GenericResponse};
use model::user::UserContext;

/// Gets all pending reminders for the authenticated user
#[utoipa::path(
    get,
    path = "/reminders",
    responses(
        (status = 200),
        (status = 401, body = GenericErrorResponse),
        (status = 500, body = GenericErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user_context), fields(user_id=?user_context.user_id))]
pub async fn get_reminders_handler(
    State(ctx): State<ApiContext>,
    user_context: Extension<UserContext>,
) -> impl IntoResponse {
    match macro_db_client::reminders::get_pending_reminders(&ctx.db, &user_context.user_id).await {
        Ok(reminders) => GenericResponse::builder()
            .data(&reminders)
            .send(StatusCode::OK),
        Err(e) => {
            tracing::error!(error=?e, "unable to get reminders");
            GenericResponse::builder()
                .message("unable to get reminders")
                .is_error(true)
                .send(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
