#![deny(missing_docs)]
//! Shared helpers for building Postgres connection pools with service-identifying metadata.
//!
//! Bring [`PgPoolOptionsExt`] into scope and call [`PgPoolOptionsExt::connect_with_app_name`]
//! in place of `connect` so that queries from the service show up in `pg_stat_activity` and
//! RDS Performance Insights under a specific `application_name` rather than `Unknown`.

use sqlx::PgPool;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::future::Future;

/// Extension trait that adds an `application_name`-aware connect method to [`PgPoolOptions`].
///
/// The name is read from the `DD_SERVICE` env var (set in Pulumi per service) and falls back
/// to `"unknown-service"` when unset.
pub trait PgPoolOptionsExt {
    /// Connect to Postgres, stamping `application_name = $DD_SERVICE` on the connection so
    /// the originating service is visible in `pg_stat_activity` and PI.
    fn connect_with_app_name(
        self,
        database_url: &str,
    ) -> impl Future<Output = Result<PgPool, sqlx::Error>> + Send;
}

impl PgPoolOptionsExt for PgPoolOptions {
    async fn connect_with_app_name(self, database_url: &str) -> Result<PgPool, sqlx::Error> {
        let name = std::env::var("DD_SERVICE").unwrap_or_else(|_| "unknown-service".to_string());
        let opts = database_url
            .parse::<PgConnectOptions>()?
            .application_name(&name);
        self.connect_with(opts).await
    }
}
