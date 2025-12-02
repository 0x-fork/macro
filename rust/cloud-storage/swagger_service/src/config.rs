#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = std::env::var("PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .unwrap_or(8080);

        Ok(Self { port })
    }
}
