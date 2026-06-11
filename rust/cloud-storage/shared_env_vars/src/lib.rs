#![deny(missing_docs)]

//! Marker types for environment variables that are shared by many services.
//!
//! Each marker is a [`macro_env_var::env_var!`] sentinel for an env var that several services
//! load under the same key (e.g. `DATABASE_URL`). Sharing one type per key lets library code
//! require just the values it needs from any service config via a bound like
//! `where DatabaseUrl: macro_config::FromRef<E>`, instead of depending on a concrete config
//! struct.

use macro_env_var::env_var;

/// Markers for MacroDB, the main Postgres database (schema and migrations live in
/// `macro_db_client`).
///
/// The marker lives in this module rather than carrying the database name in the type name
/// because [`macro_env_var::env_var!`] derives the env key from the type name: the type must be
/// `DatabaseUrl` so `::new()` reads `DATABASE_URL`, which is the key MacroDB-backed services are
/// deployed with. Markers for other databases (CommsDB, EmailDB, ContactsDB, ...) should get
/// their own module here when they are needed.
pub mod macro_db {
    macro_env_var::env_var! {
        /// The connection URL for MacroDB (`DATABASE_URL`).
        ///
        /// Only services whose `DATABASE_URL` is provisioned from the MacroDB secret should use
        /// this marker; a service pointing the same key at a different database needs its own
        /// type.
        #[derive(Debug, Clone)]
        pub struct DatabaseUrl;
    }
}

env_var! {
    /// The Redis URI for the Redis instance a service should use (`REDIS_URI`).
    #[derive(Debug, Clone)]
    pub struct RedisUri;
}

env_var! {
    /// The notification ingress SQS queue (`NOTIFICATION_QUEUE`).
    #[derive(Debug, Clone)]
    pub struct NotificationQueue;
}

env_var! {
    /// The search event SQS queue (`SEARCH_EVENT_QUEUE`).
    #[derive(Debug, Clone)]
    pub struct SearchEventQueue;
}

env_var! {
    /// The internal auth key used to call other services (`SERVICE_INTERNAL_AUTH_KEY`).
    #[derive(Debug, Clone)]
    pub struct ServiceInternalAuthKey;
}
