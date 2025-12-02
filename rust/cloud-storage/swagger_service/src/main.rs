use anyhow::Context;
use axum::{routing::get, Router};
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

// Import ApiDocs from services that compile as libraries
use authentication_service::api::swagger::ApiDoc as AuthApiDoc;
use connection_gateway_client::api::swagger::ApiDoc as ConnectionGatewayApiDoc;
use contacts_service::api::swagger::ApiDoc as ContactsApiDoc;
use email_service::api::swagger::ApiDoc as EmailApiDoc;
use experiment_service::api::swagger::ApiDoc as ExperimentApiDoc;
use metering_service::api::swagger::ApiDoc as MeteringApiDoc;
use unfurl_service::api::swagger::ApiDoc as UnfurlApiDoc;

// TODO: Add these once their lib.rs exports are fixed:
// use comms_service::api::swagger::ApiDoc as CommsApiDoc;
// use convert_service::api::swagger::ApiDoc as ConvertApiDoc;
// use document_cognition_service::api::swagger::ApiDoc as DocumentCognitionApiDoc;
// use document_storage_service::api::swagger::ApiDoc as DocumentStorageApiDoc;
// use insight_service::api::swagger::ApiDoc as InsightApiDoc;
// use notification_service::api::swagger::ApiDoc as NotificationApiDoc;
// use organization_service::api::swagger::ApiDoc as OrganizationApiDoc;
// use properties_service::api::swagger::ApiDoc as PropertiesApiDoc;
// use search_processing_service::api::swagger::ApiDoc as SearchProcessingApiDoc;
// use search_service::api::swagger::ApiDoc as SearchApiDoc;
// use static_file_service::api::swagger::ApiDoc as StaticFileApiDoc;

mod config;
use config::Config;

/// Serves Swagger UI with all service specs loaded at compile time
fn create_swagger_ui() -> SwaggerUi {
    SwaggerUi::new("/docs")
        .url("/api-doc/authentication.json", AuthApiDoc::openapi())
        .url("/api-doc/connection-gateway.json", ConnectionGatewayApiDoc::openapi())
        .url("/api-doc/contacts.json", ContactsApiDoc::openapi())
        .url("/api-doc/email.json", EmailApiDoc::openapi())
        .url("/api-doc/experiment.json", ExperimentApiDoc::openapi())
        .url("/api-doc/metering.json", MeteringApiDoc::openapi())
        .url("/api-doc/unfurl.json", UnfurlApiDoc::openapi())
}

/// Health check endpoint
async fn health() -> &'static str {
    "ok"
}

#[tokio::main]
#[tracing::instrument(err)]
async fn main() -> anyhow::Result<()> {
    macro_entrypoint::MacroEntrypoint::default().init();

    let config = Config::from_env().context("Failed to load config")?;
    let port = config.port;

    let cors = macro_cors::cors_layer();

    let app = Router::new()
        .route("/health", get(health))
        .merge(create_swagger_ui())
        .layer(cors)
        .layer(ServiceBuilder::new().layer(TraceLayer::new_for_http()));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .context("Failed to bind to port")?;

    tracing::info!("Swagger service running on port {}", port);

    axum::serve(listener, app.into_make_service())
        .await
        .context("Error running server")
}
