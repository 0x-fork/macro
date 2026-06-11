use std::sync::LazyLock;

use anyhow::Context;
pub use macro_env::Environment;
use macro_env_var::{env_var, maybe_env_var};
use shared_env_vars::{
    NotificationQueue, RedisUri, SearchEventQueue, ServiceInternalAuthKey, macro_db,
};

// BASE_URL config value. This is validated when creating the config in main.rs
pub static BASE_URL: LazyLock<String> = LazyLock::new(|| {
    macro_config::required_config_value("BASE_URL")
        .expect("BASE_URL must be provided via APP_SECRETS_JSON or env")
});

env_var! {
    /// The public base URL of this service.
    #[derive(Debug, Clone)]
    pub struct BaseUrl;
}

env_var! {
    /// FusionAuth Tenant Id
    #[derive(Debug, Clone)]
    pub struct FusionauthTenantId;
}

env_var! {
    /// FusionAuth API key secret name
    #[derive(Debug, Clone)]
    pub struct FusionauthApiKeySecretKey;
}

env_var! {
    /// FusionAuth client id
    #[derive(Debug, Clone)]
    pub struct FusionauthClientId;
}

env_var! {
    /// FusionAuth client secret key
    #[derive(Debug, Clone)]
    pub struct FusionauthClientSecretKey;
}

env_var! {
    /// FusionAuth base url
    #[derive(Debug, Clone)]
    pub struct FusionauthBaseUrl;
}

env_var! {
    /// FusionAuth oauth redirect uri
    #[derive(Debug, Clone)]
    pub struct FusionauthOauthRedirectUri;
}

env_var! {
    /// Google client id
    #[derive(Debug, Clone)]
    pub struct GoogleClientId;
}

env_var! {
    /// Google client secret key
    #[derive(Debug, Clone)]
    pub struct GoogleClientSecretKey;
}

env_var! {
    /// Stripe secret key
    #[derive(Debug, Clone)]
    pub struct StripeSecretKey;
}

env_var! {
    /// The email link manager queue
    #[derive(Debug, Clone)]
    pub struct LinkManagerQueue;
}

env_var! {
    /// The email backfill queue
    #[derive(Debug, Clone)]
    pub struct EmailBackfillQueue;
}

env_var! {
    /// The github client id
    #[derive(Debug, Clone)]
    pub struct GithubClientId;
}

env_var! {
    /// The github client secret
    #[derive(Debug, Clone)]
    pub struct GithubClientSecret;
}

env_var! {
    /// The github idp id
    #[derive(Debug, Clone)]
    pub struct GithubIdpId;
}

env_var! {
    /// The stripe price id
    #[derive(Debug, Clone)]
    pub struct StripePriceId;
}

maybe_env_var! {
    /// GA4 Measurement ID (e.g., "G-XXXXXXXXXX")
    #[derive(Debug, Clone)]
    pub struct GaMeasurementId;
}

maybe_env_var! {
    /// GA4 Measurement Protocol API secret
    #[derive(Debug, Clone)]
    pub struct GaApiSecret;
}

maybe_env_var! {
    /// Meta Pixel ID
    #[derive(Debug, Clone)]
    pub struct MetaPixelId;
}

maybe_env_var! {
    /// Meta Conversions API access token
    #[derive(Debug, Clone)]
    pub struct MetaAccessToken;
}

maybe_env_var! {
    /// Meta test event code for testing
    #[derive(Debug, Clone)]
    pub struct MetaTestEventCode;
}

maybe_env_var! {
    /// PostHog API key
    #[derive(Debug, Clone)]
    pub struct PosthogApiKey;
}

maybe_env_var! {
    /// PostHog host
    #[derive(Debug, Clone)]
    pub struct PosthogHost;
}

/// The configuration parameters for the application.
///
/// These can either be passed on the command line, or pulled from environment variables.
/// The latter is preferred as environment variables are one of the recommended ways to
/// populate the Docker container
///
/// See `.env.sample` in document-storage-service root for details.
#[derive(macro_config::MacroConfig)]
#[from_ref_all]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    pub base_url: BaseUrl,
    /// The connection URL for MacroDB, the Postgres database this application should use.
    pub database_url: macro_db::DatabaseUrl,
    /// The Redis URI for the Redis this application should use.
    pub redis_uri: RedisUri,

    /// FusionAuth Tenant Id
    pub fusionauth_tenant_id: FusionauthTenantId,
    /// FusionAuth API key secret name
    pub fusionauth_api_key_secret_key: FusionauthApiKeySecretKey,
    /// FusionAuth client id
    pub fusionauth_client_id: FusionauthClientId,
    /// FusionAuth client secret key
    pub fusionauth_client_secret_key: FusionauthClientSecretKey,
    /// FusionAuth base url
    pub fusionauth_base_url: FusionauthBaseUrl,
    /// FusionAuth oauth redirect uri
    pub fusionauth_oauth_redirect_uri: FusionauthOauthRedirectUri,
    /// Google client id
    pub google_client_id: GoogleClientId,
    /// Google client secret key
    pub google_client_secret_key: GoogleClientSecretKey,

    /// Stripe secret key
    pub stripe_secret_key: StripeSecretKey,

    /// The port to listen for HTTP requests on.
    #[macro_config_default(8080)]
    pub port: usize,

    /// The environment we are in
    #[macro_config_default(Environment::new_or_prod())]
    pub environment: Environment,

    /// The internal auth key used by other services
    pub service_internal_auth_key: ServiceInternalAuthKey,

    /// The notification queue
    pub notification_queue: NotificationQueue,

    /// The search event queue
    pub search_event_queue: SearchEventQueue,

    /// The email link manager queue
    pub link_manager_queue: LinkManagerQueue,

    /// The email backfill queue. Used by `join_team` to enqueue a
    /// `PopulateCrmForUser` message that seeds CRM tables with the new
    /// member's historical sent-mail contacts.
    pub email_backfill_queue: EmailBackfillQueue,

    /// The github client id
    pub github_client_id: GithubClientId,
    /// The github client secret
    pub github_client_secret: GithubClientSecret,
    /// The github idp id
    pub github_idp_id: GithubIdpId,

    /// GA4 Measurement ID (optional, e.g., "G-XXXXXXXXXX")
    pub ga_measurement_id: Option<GaMeasurementId>,
    /// GA4 Measurement Protocol API secret (optional)
    pub ga_api_secret: Option<GaApiSecret>,

    /// Meta Pixel ID (optional)
    pub meta_pixel_id: Option<MetaPixelId>,
    /// Meta Conversions API access token (optional)
    pub meta_access_token: Option<MetaAccessToken>,
    /// Meta test event code for testing (optional)
    pub meta_test_event_code: Option<MetaTestEventCode>,

    /// PostHog API key (optional)
    pub posthog_api_key: Option<PosthogApiKey>,
    /// PostHog host (optional)
    pub posthog_host: Option<PosthogHost>,

    /// The stripe price id
    pub stripe_price_id: StripePriceId,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        macro_config::ConfigLoader::load::<Config>()
            .context("failed to load authentication service config")
    }
}
