use anyhow::Context;
pub use macro_env::Environment;

/// Runtime configuration for the calendar service.
pub struct Config {
    /// Port number to listen on.
    pub port: usize,
    /// The deployment environment.
    pub environment: Environment,
    /// Postgres connection URL.
    pub database_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port: usize = std::env::var("PORT")
            .unwrap_or("8080".to_string())
            .parse::<usize>()
            .context("PORT must be a valid number")?;

        let database_url =
            std::env::var("DATABASE_URL").context("DATABASE_URL must be provided")?;

        let environment = Environment::new_or_prod();

        Ok(Config {
            port,
            environment,
            database_url,
        })
    }
}
