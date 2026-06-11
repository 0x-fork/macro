use super::*;

#[test]
fn config_loads_with_preexisting_env_var_names() {
    // Exactly the keys the deployed environment provides today (infra/stacks/authentication-service).
    // APP_SECRETS_JSON has no env fallback per-key, so this fails if any key changed.
    let secrets = serde_json::json!({
        "BASE_URL": "https://auth.macro.com",
        "DATABASE_URL": "postgres://db",
        "REDIS_URI": "redis://cache",
        "FUSIONAUTH_TENANT_ID": "tenant",
        "FUSIONAUTH_API_KEY_SECRET_KEY": "fa-api-key",
        "FUSIONAUTH_CLIENT_ID": "fa-client-id",
        "FUSIONAUTH_CLIENT_SECRET_KEY": "fa-client-secret",
        "FUSIONAUTH_BASE_URL": "https://fa.macro.com",
        "FUSIONAUTH_OAUTH_REDIRECT_URI": "https://auth.macro.com/cb",
        "GOOGLE_CLIENT_ID": "google-id",
        "GOOGLE_CLIENT_SECRET_KEY": "google-secret",
        "STRIPE_SECRET_KEY": "stripe-secret",
        "SERVICE_INTERNAL_AUTH_KEY": "internal-key",
        "NOTIFICATION_QUEUE": "notif-q",
        "SEARCH_EVENT_QUEUE": "search-q",
        "LINK_MANAGER_QUEUE": "link-q",
        "EMAIL_BACKFILL_QUEUE": "backfill-q",
        "GITHUB_CLIENT_ID": "gh-id",
        "GITHUB_CLIENT_SECRET": "gh-secret",
        "GITHUB_IDP_ID": "gh-idp",
        "GA_MEASUREMENT_ID": "G-123",
        "GA_API_SECRET": "ga-secret",
        "META_PIXEL_ID": "pixel",
        "META_ACCESS_TOKEN": "meta-token",
        "META_TEST_EVENT_CODE": "test-code",
        "POSTHOG_API_KEY": "ph-key",
        "POSTHOG_HOST": "https://ph.macro.com",
        "STRIPE_PRICE_ID": "price-123",
        "PORT": 9999
    });
    unsafe {
        std::env::set_var("APP_SECRETS_JSON", secrets.to_string());
    }

    let config = Config::from_env().expect("config should load from pre-existing env var names");

    assert_eq!(&*config.base_url, "https://auth.macro.com");
    assert_eq!(&*config.database_url, "postgres://db");
    assert_eq!(&*config.redis_uri, "redis://cache");
    assert_eq!(&*config.fusionauth_tenant_id, "tenant");
    assert_eq!(&*config.fusionauth_api_key_secret_key, "fa-api-key");
    assert_eq!(&*config.fusionauth_client_id, "fa-client-id");
    assert_eq!(&*config.fusionauth_client_secret_key, "fa-client-secret");
    assert_eq!(&*config.fusionauth_base_url, "https://fa.macro.com");
    assert_eq!(
        &*config.fusionauth_oauth_redirect_uri,
        "https://auth.macro.com/cb"
    );
    assert_eq!(&*config.google_client_id, "google-id");
    assert_eq!(&*config.google_client_secret_key, "google-secret");
    assert_eq!(&*config.stripe_secret_key, "stripe-secret");
    assert_eq!(&*config.service_internal_auth_key, "internal-key");
    assert_eq!(&*config.notification_queue, "notif-q");
    assert_eq!(&*config.search_event_queue, "search-q");
    assert_eq!(&*config.link_manager_queue, "link-q");
    assert_eq!(&*config.email_backfill_queue, "backfill-q");
    assert_eq!(&*config.github_client_id, "gh-id");
    assert_eq!(&*config.github_client_secret, "gh-secret");
    assert_eq!(&*config.github_idp_id, "gh-idp");
    assert_eq!(config.ga_measurement_id.as_deref(), Some("G-123"));
    assert_eq!(config.ga_api_secret.as_deref(), Some("ga-secret"));
    assert_eq!(config.meta_pixel_id.as_deref(), Some("pixel"));
    assert_eq!(config.meta_access_token.as_deref(), Some("meta-token"));
    assert_eq!(config.meta_test_event_code.as_deref(), Some("test-code"));
    assert_eq!(config.posthog_api_key.as_deref(), Some("ph-key"));
    assert_eq!(config.posthog_host.as_deref(), Some("https://ph.macro.com"));
    assert_eq!(&*config.stripe_price_id, "price-123");
    assert_eq!(config.port, 9999);
}
