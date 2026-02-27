pub(crate) mod archived;
pub(crate) mod get;
pub(crate) mod labels;
pub(crate) mod seen;
pub(crate) mod thread_router;

use axum::Router;
use axum::routing::{get, patch, post};
use thread_router::EmailRouterState;
use tower::ServiceBuilder;

use crate::api::ApiContext;

pub fn router(state: ApiContext) -> Router<ApiContext> {
    let required_link_routes = Router::new()
        .nest(
            "/previews",
            email::inbound::router(state.email_service.clone()),
        )
        .route(
            "/:id/seen",
            post(seen::seen_handler).layer(axum::middleware::from_fn_with_state(
                state.clone(),
                crate::api::middleware::gmail_token::attach_gmail_token,
            )),
        )
        .route("/:id/messages", get(get::get_thread_messages_handler))
        .route(
            "/:id/archived",
            patch(archived::archived_handler).layer(ServiceBuilder::new().layer(
                axum::middleware::from_fn_with_state(
                    state.clone(),
                    crate::api::middleware::gmail_token::attach_gmail_token,
                ),
            )),
        )
        .route(
            "/:id/labels",
            patch(labels::handler).layer(axum::middleware::from_fn_with_state(
                state.clone(),
                crate::api::middleware::gmail_token::attach_gmail_token,
            )),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.email_service.clone(),
            crate::api::middleware::link::attach_link_context,
        ));

    // user can still view threads shared with them if they don't have email enabled
    let thread_routes = thread_router::thread_router(EmailRouterState {
        email_service: state.email_service.inner.clone(),
        access_service: state.entity_access_service.clone(),
        pool: state.db.clone(),
    });

    Router::new()
        .merge(required_link_routes)
        .merge(thread_routes)
}
