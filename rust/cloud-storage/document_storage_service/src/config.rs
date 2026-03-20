pub use macro_env::Environment;
use macro_env_var::env_var;
use secretsmanager_client::LocalOrRemoteSecret;

/// The configuration parameters for the application.
///
/// These can either be passed on the command line, or pulled from environment variables.
/// The latter is preferred as environment variables are one of the recommended ways to
/// populate the Docker container
///
/// See `.env.sample` in document-storage-service root for details.
pub struct Config {
    pub vars: EnvVars,

    /// The port to listen for HTTP requests on.
    pub port: usize,

    /// The environment we are in
    pub environment: Environment,

    /// Maximum number of SQS messages to receive per poll for the delete document worker
    pub queue_max_messages: i32,
    /// SQS long-poll wait time in seconds for the delete document worker
    pub queue_wait_time_seconds: i32,

    /// The document limit for free users
    pub document_limit: u64,

    /// The number of seconds a presigned url is valid for
    pub document_storage_service_presigned_url_expiry_seconds: u64,
    /// The number of seconds a browser cache for a presigned url is valid for
    pub document_storage_service_presigned_url_browser_cache_expiry_seconds: u64,
    pub document_storage_service_cloudfront_signer_private_key:
        LocalOrRemoteSecret<DocumentStorageServiceCloudfrontSignerPrivateKeySecretName>,

    pub document_permission_jwt: LocalOrRemoteSecret<DocumentPermissionJwtSecretKey>,
    pub livekit: Option<LiveKitConfig>,
}

#[derive(Debug, Clone)]
pub struct LiveKitConfig {
    pub api_url: String,
    pub ws_url: String,
    pub api_key: String,
    pub api_secret: String,
    pub room_prefix: String,
}

env_var! {
    struct EnvVars {
        pub DatabaseUrl,
        pub DocumentStorageBucket,
        pub DocxDocumentUploadBucket,
        pub DocumentDeleteQueue,
        pub DocumentStorageServiceCloudfrontDistributionUrl,
        pub DocumentStorageServiceCloudfrontSignerPublicKeyId,
        pub RedisUri,
        pub NotificationQueue,
        pub SearchEventQueue,
        pub ConnectionGatewayUrl,
        pub BulkUploadRequestsTable,
        pub UploadStagingBucket,
        pub SyncServiceUrl,
        pub SyncServiceAuthKey,
        pub AuthenticationServiceUrl,
        pub AuthenticationServiceSecretKey,
        pub OpensearchUrl,
        pub OpensearchUsername,
        pub OpensearchPassword,
        pub ContactsQueue,
        pub GithubSyncAppUrl,
        pub GithubSyncAppClientId,
    }
}

env_var! { struct Port; }
env_var! { struct DocumentLimit; }
env_var! { struct DocumentStorageServicePresignedUrlExpirySeconds; }
env_var! { struct DocumentStorageServicePresignedUrlBrowserCacheExpirySeconds; }
env_var! { pub struct DocumentStorageServiceCloudfrontSignerPrivateKeySecretName; }
env_var! {
    #[derive(Clone)]
    pub struct DocumentPermissionJwtSecretKey;
}
env_var! {
    pub struct GithubWebhookSecretKey;
}

env_var! {
    pub struct GithubSyncAppPemSecretKey;
}

impl Config {
    pub fn from_env(
        document_storage_service_cloudfront_signer_private_key: LocalOrRemoteSecret<
            DocumentStorageServiceCloudfrontSignerPrivateKeySecretName,
        >,
        document_permission_jwt: LocalOrRemoteSecret<DocumentPermissionJwtSecretKey>,
    ) -> anyhow::Result<Self> {
        let environment = Environment::new_or_prod();

        let port = Port::new()
            .ok()
            .and_then(|v| v.as_ref().parse::<usize>().ok())
            .unwrap_or(8080);

        let document_limit = DocumentLimit::new()
            .ok()
            .and_then(|v| v.as_ref().parse::<u64>().ok())
            .unwrap_or(20);

        let document_storage_service_presigned_url_expiry_seconds =
            DocumentStorageServicePresignedUrlExpirySeconds::new()
                .ok()
                .and_then(|v| v.as_ref().parse::<u64>().ok())
                .unwrap_or(DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS);

        let document_storage_service_presigned_url_browser_cache_expiry_seconds =
            DocumentStorageServicePresignedUrlBrowserCacheExpirySeconds::new()
                .ok()
                .and_then(|v| v.as_ref().parse::<u64>().ok())
                .unwrap_or(DEFAULT_PRESIGNED_URL_BROWSER_CACHE_EXPIRY_SECONDS);

        let queue_max_messages: i32 = std::env::var("QUEUE_MAX_MESSAGES")
            .unwrap_or("10".to_string())
            .parse()
            .unwrap_or(10);

        let queue_wait_time_seconds: i32 = std::env::var("QUEUE_WAIT_TIME_SECONDS")
            .unwrap_or("4".to_string())
            .parse()
            .unwrap_or(4);

        let vars = EnvVars::new()?;
        let livekit = load_livekit_config()?;

        Ok(Config {
            vars,
            port,
            environment,
            queue_max_messages,
            queue_wait_time_seconds,
            document_limit,
            document_storage_service_presigned_url_expiry_seconds,
            document_storage_service_presigned_url_browser_cache_expiry_seconds,
            document_storage_service_cloudfront_signer_private_key,
            document_permission_jwt,
            livekit,
        })
    }
}

pub const DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS: u64 = 900; // 15 minutes
pub const DEFAULT_PRESIGNED_URL_BROWSER_CACHE_EXPIRY_SECONDS: u64 = 840; // remember that this is just a suggestion to the client browser 

fn load_livekit_config() -> anyhow::Result<Option<LiveKitConfig>> {
    let api_url = std::env::var("LIVEKIT_API_URL").ok();
    let ws_url = std::env::var("LIVEKIT_WS_URL").ok();
    let api_key = std::env::var("LIVEKIT_API_KEY").ok();
    let api_secret = std::env::var("LIVEKIT_API_SECRET").ok();

    if api_url.is_none() && ws_url.is_none() && api_key.is_none() && api_secret.is_none() {
        return Ok(None);
    }

    let (Some(api_url), Some(ws_url), Some(api_key), Some(api_secret)) =
        (api_url, ws_url, api_key, api_secret)
    else {
        anyhow::bail!(
            "LIVEKIT_API_URL, LIVEKIT_WS_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set together"
        );
    };

    Ok(Some(LiveKitConfig {
        api_url,
        ws_url,
        api_key,
        api_secret,
        room_prefix: std::env::var("LIVEKIT_ROOM_PREFIX").unwrap_or_else(|_| "macro".to_string()),
    }))
}
