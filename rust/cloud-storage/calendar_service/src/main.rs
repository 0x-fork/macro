#![recursion_limit = "256"]
mod config;
mod health;

use std::sync::Arc;

use anyhow::Context;
use calendar::domain::service::CalendarDomainService;
use calendar::inbound::http::{ApiDoc, AppState, api_router};
use calendar::outbound::repository::DbCalendarRepository;
use config::{Config, Environment};
use macro_entrypoint::MacroEntrypoint;
use sqlx::postgres::PgPoolOptions;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

async fn connect_to_database(config: &Config) -> anyhow::Result<sqlx::PgPool> {
    let (min_connections, max_connections): (u32, u32) = match config.environment {
        Environment::Production => (5, 30),
        Environment::Develop => (1, 25),
        Environment::Local => (1, 10),
    };

    let db = PgPoolOptions::new()
        .min_connections(min_connections)
        .max_connections(max_connections)
        .connect(&config.database_url)
        .await
        .context("could not connect to db")?;
    Ok(db)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    MacroEntrypoint::default().init();

    let config = Config::from_env().context("expected to be able to generate config")?;

    let db = connect_to_database(&config).await?;

    let secretsmanager_client = secretsmanager_client::SecretsManager::new(
        aws_sdk_secretsmanager::Client::new(&macro_aws_config::get_macro_aws_config().await),
    );

    let jwt_args = macro_auth::middleware::decode_jwt::JwtValidationArgs::new_with_secret_manager(
        config.environment,
        &secretsmanager_client,
    )
    .await?;

    let repository = DbCalendarRepository::new(db.clone());
    let service = Arc::new(CalendarDomainService::new(repository));

    let cors = macro_cors::cors_layer();
    let port = config.port;

    let app = api_router(AppState {
        jwt_args,
        calendar_service: service,
    })
    .layer(cors.clone())
    .merge(health::router().layer(cors))
    .merge(SwaggerUi::new("/docs").url("/api-doc/openapi.json", ApiDoc::openapi()));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    tracing::info!("calendar service is up and running on port {}", &port);

    axum::serve(listener, app.into_make_service())
        .await
        .context("error starting service")?;
    Ok(())
}
