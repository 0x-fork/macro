//! Startup configuration. Every value comes from Doppler (`APP_SECRETS_JSON` in
//! ECS); `main.rs` reads the test-only overrides from the process environment.

use database_env_vars::DatabaseUrl;
use macro_env_var::env_vars;

env_vars! {
    /// Direct, non-pooled MacroDB URL for the advisory-lock connection and `LISTEN`.
    pub struct WhatsappSessionLockDatabaseUrl;
}

/// Settings supplied by the deployment.
#[derive(macro_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// Pooled MacroDB URL for every read and fenced write.
    pub database_url: DatabaseUrl,
    /// Direct, non-pooled MacroDB URL: the advisory-lock connection and `LISTEN`.
    pub whatsapp_session_lock_database_url: WhatsappSessionLockDatabaseUrl,
    /// KMS key that wraps each account's data key.
    pub whatsapp_session_kms_key_id: String,
    /// Most accounts one replica runs.
    pub whatsapp_session_max_accounts: u32,
    /// Accounts released per drain step on shutdown.
    pub whatsapp_session_drain_batch: u32,
}
