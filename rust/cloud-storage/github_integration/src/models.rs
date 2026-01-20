use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// GitHub OAuth token exchange response
#[derive(Debug, Deserialize)]
pub struct GitHubExchangeTokenResponse {
    /// The access token for GitHub API calls
    pub access_token: String,
    /// The type of token (usually "bearer")
    pub token_type: String,
    /// The scopes granted to this token
    pub scope: String,
}

/// GitHub user information retrieved from GitHub API
#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUserInfo {
    /// GitHub user ID (numeric)
    pub id: u64,
    /// GitHub username
    pub login: String,
    /// Primary email (may be null if private)
    pub email: Option<String>,
    /// Display name
    pub name: Option<String>,
}

/// GitHub email information from /user/emails endpoint
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GitHubEmail {
    pub email: String,
    pub primary: bool,
    pub verified: bool,
}

/// Response returned when retrieving GitHub credentials
#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCredentialsResponse {
    /// The OAuth access token
    pub access_token: String,
    /// GitHub username
    pub github_username: String,
    /// GitHub user ID
    pub github_user_id: String,
}

/// GitHub link information for listing
#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitHubLinkInfo {
    /// The link ID
    pub id: String,
    /// GitHub username
    pub github_username: String,
    /// GitHub user ID
    pub github_user_id: String,
    /// When the link was created
    pub created_at: DateTime<Utc>,
}

/// OAuth state passed through the authorization flow
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthState {
    /// FusionAuth identity provider ID
    pub identity_provider_id: String,
    /// Link ID for tracking the OAuth flow (present for integration, absent for login)
    pub link_id: Option<String>,
    /// Original URL to redirect to after OAuth
    pub original_url: Option<String>,
    /// Whether this is a mobile OAuth flow
    pub is_mobile: Option<bool>,
}

/// A GitHub link record (as stored in the database)
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GitHubLink {
    /// Unique ID for this link
    pub id: Uuid,
    /// Macro user ID
    pub macro_id: String,
    /// FusionAuth user ID
    pub fusionauth_user_id: Uuid,
    /// GitHub username
    pub github_username: String,
    /// GitHub user ID (as string)
    pub github_user_id: String,
    /// When the link was created
    pub created_at: DateTime<Utc>,
    /// When the link was last updated
    pub updated_at: DateTime<Utc>,
}

impl From<GitHubLink> for GitHubLinkInfo {
    fn from(link: GitHubLink) -> Self {
        GitHubLinkInfo {
            id: link.id.to_string(),
            github_username: link.github_username,
            github_user_id: link.github_user_id,
            created_at: link.created_at,
        }
    }
}
