pub(crate) mod archived;
pub(crate) mod get;
pub(crate) mod labels;
pub(crate) mod seen;

use axum::Router;
use axum::routing::{get, patch, post};
use email::inbound::EmailThreadRouterState;
use tower::ServiceBuilder;

use crate::api::ApiContext;
use crate::api::context::EmailEntityAccessService;

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

    let hex_thread_state: EmailThreadRouterState<_, EmailEntityAccessService> =
        EmailThreadRouterState {
            service: state.email_service.service(),
            access_service: state.entity_access_service.clone(),
            pool: state.db.clone(),
        };
    let hex_thread_routes = email::inbound::thread_router(hex_thread_state);

    Router::new()
        .merge(required_link_routes)
        .merge(hex_thread_routes)
}
