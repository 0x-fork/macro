use anyhow::Context;
use macro_auth::InternalApiKey;
pub use macro_env::Environment;
use macro_env_var::{env_vars, maybe_env_vars};
use macro_service_urls::AiEditingWorkerUrl;
use secretsmanager_client::LocalOrRemoteSecret;

use crate::core::constants::DEFAULT_DOCUMENT_BATCH_LIMIT;

env_vars!(
    pub struct DatabaseUrl;
    pub struct DocumentStorageBucket;
    pub struct DocumentStorageServiceAuthKey;
    pub struct SyncServiceAuthKey;
    pub struct AuthenticationServiceUrl;
    pub struct AuthenticationServiceSecretKey;
    pub struct RedisHost;
    pub struct DocxDocumentUploadBucket;
    pub struct DocumentStorageServiceCloudfrontDistributionUrl;
    pub struct DocumentStorageServiceCloudfrontSignerPublicKeyId;
    pub struct DocumentStorageServiceCloudfrontSignerPrivateKey;
    pub struct McpCredentialsKeySecretName;
    pub struct DocumentPermissionJwt;
    /// Comma-separated Kafka bootstrap servers for the macro event broker.
    pub struct KafkaBrokers;
);

maybe_env_vars!(
    pub struct DocumentBatchLimit;
    /// Secret key for the Nango environment used for MCP server auth.
    /// When unset, Nango-based MCP connect is disabled and the legacy
    /// in-house OAuth flow is the only way to authorize MCP servers.
    pub struct NangoSecretKey;
    /// Base URL of the Nango API. Defaults to `https://api.nango.dev`.
    pub struct NangoApiUrl;
    /// Nango integration ID (provider config key) for MCP server auth.
    /// Defaults to `mcp-generic`, Nango's generic MCP OAuth2 integration.
    pub struct NangoMcpIntegrationId;
    /// Base URL of the public MCP server registry backing the connector
    /// catalog. Defaults to `https://registry.modelcontextprotocol.io`.
    pub struct McpRegistryUrl;
);

/// The configuration parameters for the application.
#[derive(macro_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// The connection URL for the Postgres database this application should use.
    pub database_url: DatabaseUrl,
    /// The port to listen for HTTP requests on.
    #[macro_config_default(8080)]
    pub port: usize,
    /// The environment we are in
    #[macro_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// The maximum number of results in a document query
    #[macro_config_default(DEFAULT_DOCUMENT_BATCH_LIMIT)]
    pub document_batch_limit: i64,
    /// document storage bucket
    pub document_storage_bucket: DocumentStorageBucket,
    /// document storage service auth key
    pub document_storage_service_auth_key: DocumentStorageServiceAuthKey,
    pub sync_service_auth_key: LocalOrRemoteSecret<SyncServiceAuthKey>,
    /// authentication service secret key (for soup service)
    pub authentication_service_secret_key: AuthenticationServiceSecretKey,
    /// Redis host for stream service
    pub redis_host: RedisHost,
    /// The S3 bucket for DOCX document uploads
    pub docx_document_upload_bucket: DocxDocumentUploadBucket,
    /// CloudFront distribution URL for document storage
    pub document_storage_service_cloudfront_distribution_url:
        DocumentStorageServiceCloudfrontDistributionUrl,
    /// CloudFront signer public key ID
    pub document_storage_service_cloudfront_signer_public_key_id:
        DocumentStorageServiceCloudfrontSignerPublicKeyId,
    /// CloudFront signer private key (secret name or value)
    pub document_storage_service_cloudfront_signer_private_key:
        LocalOrRemoteSecret<DocumentStorageServiceCloudfrontSignerPrivateKey>,
    /// MCP credentials encryption key (base64-encoded, secret name or value)
    pub mcp_credentials_key_secret_name: LocalOrRemoteSecret<McpCredentialsKeySecretName>,
    /// Secret key for the Nango environment used for MCP server auth.
    pub nango_secret_key: NangoSecretKey,
    /// Base URL of the Nango API.
    pub nango_api_url: NangoApiUrl,
    /// Nango integration ID (provider config key) for MCP server auth.
    pub nango_mcp_integration_id: NangoMcpIntegrationId,
    /// Base URL of the public MCP server registry backing the connector catalog.
    pub mcp_registry_url: McpRegistryUrl,
    /// The internal api key
    pub internal_api_key: InternalApiKey,
    /// AI editing worker URL
    #[macro_config_default(AiEditingWorkerUrl::unwrap_new().to_string())]
    pub ai_editing_worker_url: String,
    /// JWT secret for minting document permission tokens for the editing worker.
    pub document_permission_jwt: DocumentPermissionJwt,
    /// Comma-separated Kafka bootstrap servers for the macro event broker.
    pub kafka_brokers: KafkaBrokers,
}

impl Config {
    #[tracing::instrument(err, skip_all)]
    pub fn from_env() -> anyhow::Result<Self> {
        macro_config::ConfigLoader::load::<Config>().context("failed to load config")
    }

    #[cfg(test)]
    pub fn new_empty_for_test() -> Self {
        Config {
            environment: Environment::Local,
            database_url: DatabaseUrl::Comptime("DATABASE_URL"),
            port: Default::default(),
            document_batch_limit: DEFAULT_DOCUMENT_BATCH_LIMIT,
            document_storage_bucket: DocumentStorageBucket::Comptime("DOCUMENT_STORAGE_BUCKET"),
            document_storage_service_auth_key: DocumentStorageServiceAuthKey::Comptime(
                "DOCUMENT_STORAGE_SERVICE_AUTH_KEY",
            ),
            sync_service_auth_key: LocalOrRemoteSecret::Local(SyncServiceAuthKey::Comptime(
                "SYNC_SERVICE_AUTH_KEY",
            )),
            authentication_service_secret_key: AuthenticationServiceSecretKey::Comptime(
                "AUTHENTICATION_SERVICE_SECRET_KEY",
            ),
            redis_host: RedisHost::Comptime("REDIS_HOST"),
            docx_document_upload_bucket: DocxDocumentUploadBucket::Comptime(
                "DOCX_DOCUMENT_UPLOAD_BUCKET",
            ),
            document_storage_service_cloudfront_distribution_url:
                DocumentStorageServiceCloudfrontDistributionUrl::Comptime(
                    "DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_DISTRIBUTION_URL",
                ),
            document_storage_service_cloudfront_signer_public_key_id:
                DocumentStorageServiceCloudfrontSignerPublicKeyId::Comptime(
                    "DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_SIGNER_PUBLIC_KEY_ID",
                ),
            document_storage_service_cloudfront_signer_private_key: LocalOrRemoteSecret::Local(
                DocumentStorageServiceCloudfrontSignerPrivateKey::Comptime(
                    "DOCUMENT_STORAGE_SERVICE_CLOUDFRONT_SIGNER_PRIVATE_KEY",
                ),
            ),
            mcp_credentials_key_secret_name: LocalOrRemoteSecret::Local(
                McpCredentialsKeySecretName::Comptime("MCP_CREDENTIALS_KEY_SECRET_NAME"),
            ),
            nango_secret_key: NangoSecretKey::Unset,
            nango_api_url: NangoApiUrl::Unset,
            nango_mcp_integration_id: NangoMcpIntegrationId::Unset,
            mcp_registry_url: McpRegistryUrl::Unset,
            internal_api_key: InternalApiKey::Comptime(""),
            ai_editing_worker_url: AiEditingWorkerUrl::unwrap_new().to_string(),
            document_permission_jwt: DocumentPermissionJwt::Comptime("DOCUMENT_PERMISSION_JWT"),
            kafka_brokers: KafkaBrokers::Comptime("localhost:9092"),
        }
    }
}
