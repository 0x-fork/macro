use super::context::ApiContext;
use axum::{
    Router,
    routing::{get, post, put},
};

pub(in crate::api) mod create_reminder;
pub(in crate::api) mod get_reminders;
pub(in crate::api) mod mark_reminder_done;

pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/", get(get_reminders::get_reminders_handler))
        .route("/", post(create_reminder::create_reminder_handler))
        .route(
            "/{reminder_id}/done",
            put(mark_reminder_done::mark_reminder_done_handler),
        )
        .layer(axum::middleware::from_fn(
            macro_middleware::auth::ensure_user_exists::handler,
        ))
}
