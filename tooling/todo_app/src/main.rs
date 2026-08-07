mod handlers;
mod store;

#[cfg(test)]
mod test;

use std::net::{Ipv4Addr, SocketAddr};

use axum::{
    routing::{get, patch},
    Router,
};

use crate::store::MemoryTodoStore;

const PORT: u16 = 3000;

pub fn router(store: MemoryTodoStore) -> Router {
    Router::new()
        .route("/", get(handlers::ui))
        .route(
            "/api/todos",
            get(handlers::list_todos).post(handlers::create_todo),
        )
        .route(
            "/api/todos/{id}",
            patch(handlers::toggle_todo).delete(handlers::delete_todo),
        )
        .with_state(store)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "purple todo app listening");

    axum::serve(listener, router(MemoryTodoStore::default())).await?;
    Ok(())
}
