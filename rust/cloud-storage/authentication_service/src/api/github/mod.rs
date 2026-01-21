pub mod callback;
pub mod disconnect;
pub mod get_credentials;
pub mod get_repo;
pub mod init;
pub mod list;
pub mod repos;

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
        .route("/credentials", get(get_credentials::handler))
        .route("/links", get(list::handler))
        .route("/link", delete(disconnect::handler))
        .route("/repos", get(repos::handler))
        .route("/repos/:owner/:repo", get(get_repo::handler))
        .layer(
            ServiceBuilder::new()
                .layer(CookieManagerLayer::new())
                .layer(axum::middleware::from_fn_with_state(
                    jwt_args,
                    macro_middleware::auth::decode_jwt::handler,
                )),
        )
}
