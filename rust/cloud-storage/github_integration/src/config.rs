/// Configuration for GitHub OAuth integration
#[derive(Debug, Clone)]
pub struct GitHubConfig {
    /// GitHub OAuth application client ID
    pub client_id: String,
    /// GitHub OAuth application client secret
    pub client_secret: String,
    /// FusionAuth identity provider ID for GitHub
    pub idp_id: String,
}

impl GitHubConfig {
    /// Creates a new GitHub configuration
    pub fn new(client_id: String, client_secret: String, idp_id: String) -> Self {
        Self {
            client_id,
            client_secret,
            idp_id,
        }
    }
}
