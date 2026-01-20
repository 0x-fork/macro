pub mod callback;
pub mod disconnect;
pub mod get;
pub mod init;
pub mod list;

use axum::{
    Router,
    routing::{delete, get, post},
};
use macro_auth::middleware::decode_jwt::JwtValidationArgs;
use tower::ServiceBuilder;
use tower_cookies::CookieManagerLayer;

use crate::api::context::ApiContext;

pub fn router(jwt_args: JwtValidationArgs) -> Router<ApiContext> {
    Router::new()
        .route("/init", post(init::handler))
        .route("/callback", get(callback::handler))
        .route("/credentials", get(get::handler))
        .route("/links", get(list::handler))
        .route("/link", delete(disconnect::handler))
        .layer(
            ServiceBuilder::new()
                .layer(CookieManagerLayer::new())
                .layer(axum::middleware::from_fn_with_state(
                    jwt_args,
                    macro_middleware::auth::decode_jwt::handler,
                )),
        )
}
