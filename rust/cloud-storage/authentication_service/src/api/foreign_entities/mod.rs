pub mod create;
pub mod get;

use axum::{Router, routing::{get as get_route, post}};
use macro_auth::middleware::decode_jwt::JwtValidationArgs;
use tower::ServiceBuilder;
use tower_cookies::CookieManagerLayer;

use crate::api::context::ApiContext;

pub fn router(jwt_args: JwtValidationArgs) -> Router<ApiContext> {
    Router::new()
        .route("/", post(create::handler))
        .route("/:namespaced_id", get_route(get::handler))
        .layer(
            ServiceBuilder::new()
                .layer(CookieManagerLayer::new())
                .layer(axum::middleware::from_fn_with_state(
                    jwt_args,
                    macro_middleware::auth::decode_jwt::handler,
                )),
        )
}
