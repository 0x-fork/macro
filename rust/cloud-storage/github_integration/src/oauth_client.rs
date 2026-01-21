use std::time::Duration;

use crate::{
    config::GitHubConfig,
    error::{GitHubIntegrationError, Result},
    models::{GitHubEmail, GitHubExchangeTokenResponse, GitHubRepository, GitHubUserInfo},
};

/// Low-level GitHub OAuth client
pub struct GitHubOAuthClient {
    http_client: reqwest::Client,
}

impl GitHubOAuthClient {
    /// Creates a new GitHub OAuth client
    pub fn new() -> Self {
        Self {
            http_client: reqwest::Client::new(),
        }
    }

    /// Constructs a GitHub OAuth authorization URL
    ///
    /// See: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
    #[tracing::instrument(skip(self, config), err)]
    pub fn construct_authorize_url<T>(
        &self,
        config: &GitHubConfig,
        redirect_uri: &str,
        state: T,
    ) -> Result<String>
    where
        T: serde::Serialize + std::fmt::Debug,
    {
        let state_str = serde_json::to_string(&state)
            .map_err(|e| GitHubIntegrationError::Generic(anyhow::anyhow!("failed to serialize state: {}", e)))?;

        let url = format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
            config.client_id,
            urlencoding::encode(redirect_uri),
            urlencoding::encode("repo user:email"),
            urlencoding::encode(&state_str)
        );

        Ok(url)
    }

    /// Exchanges an authorization code for a GitHub access token
    ///
    /// See: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#2-users-are-redirected-back-to-your-site-by-github>
    #[tracing::instrument(skip(self, config, code), err)]
    pub async fn exchange_code_for_tokens(
        &self,
        config: &GitHubConfig,
        redirect_uri: &str,
        code: &str,
    ) -> Result<GitHubExchangeTokenResponse> {
        #[derive(serde::Serialize)]
        struct TokenRequest<'a> {
            client_id: &'a str,
            client_secret: &'a str,
            code: &'a str,
            redirect_uri: &'a str,
        }

        let token_request = TokenRequest {
            client_id: &config.client_id,
            client_secret: &config.client_secret,
            code,
            redirect_uri,
        };

        let response = self
            .http_client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .json(&token_request)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| {
                tracing::error!(error=?e, "failed to send GitHub token request");
                GitHubIntegrationError::TokenExchangeFailed(e.to_string())
            })?;

        let status = response.status();

        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
            tracing::error!(status=?status, body=?error_body, "token exchange failed");
            return Err(GitHubIntegrationError::TokenExchangeFailed(format!(
                "status {}: {}",
                status, error_body
            )));
        }

        let token_response: GitHubExchangeTokenResponse = response.json().await.map_err(|e| {
            tracing::error!(error=?e, "failed to parse token response");
            GitHubIntegrationError::TokenExchangeFailed(e.to_string())
        })?;

        Ok(token_response)
    }

    /// Gets user information from GitHub using an access token
    ///
    /// See: <https://docs.github.com/en/rest/users/users#get-the-authenticated-user>
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_user_info(&self, access_token: &str) -> Result<GitHubUserInfo> {
        // Get basic user info
        let user_response = self
            .http_client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "Macro-Auth-Service")
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| GitHubIntegrationError::UserInfoFailed(e.to_string()))?;

        if !user_response.status().is_success() {
            let error_body = user_response
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(GitHubIntegrationError::UserInfoFailed(format!(
                "failed to get user info: {}",
                error_body
            )));
        }

        let mut user_info: GitHubUserInfo = user_response
            .json()
            .await
            .map_err(|e| GitHubIntegrationError::UserInfoFailed(e.to_string()))?;

        // If email is not public, try to fetch from emails endpoint (optional)
        if user_info.email.is_none() {
            tracing::debug!("Email not in public profile, attempting to fetch from /user/emails");

            match self
                .http_client
                .get("https://api.github.com/user/emails")
                .header("Authorization", format!("Bearer {}", access_token))
                .header("User-Agent", "Macro-Auth-Service")
                .timeout(Duration::from_secs(30))
                .send()
                .await
            {
                Ok(emails_response) => {
                    let status = emails_response.status();
                    tracing::debug!(status=?status, "Received response from /user/emails");

                    if status.is_success() {
                        match emails_response.json::<Vec<GitHubEmail>>().await {
                            Ok(emails) => {
                                tracing::debug!(email_count=emails.len(), "Fetched emails from GitHub");

                                // Find the primary verified email
                                if let Some(primary_email) = emails
                                    .iter()
                                    .find(|e| e.primary && e.verified)
                                    .or_else(|| emails.iter().find(|e| e.verified))
                                {
                                    tracing::debug!(email=?primary_email.email, "Found verified email");
                                    user_info.email = Some(primary_email.email.clone());
                                } else {
                                    tracing::debug!("No verified email found in GitHub account");
                                }
                            }
                            Err(e) => {
                                tracing::debug!(error=?e, "Failed to parse emails response");
                            }
                        }
                    } else {
                        let error_body = emails_response.text().await.unwrap_or_default();
                        tracing::debug!(status=?status, error=?error_body, "Failed to fetch user emails from GitHub (non-critical)");
                    }
                }
                Err(e) => {
                    tracing::debug!(error=?e, "Failed to fetch user emails (non-critical)");
                }
            }
        } else {
            tracing::debug!(email=?user_info.email, "Email found in public profile");
        }

        Ok(user_info)
    }

    /// Lists repositories accessible to the authenticated user
    ///
    /// See: <https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user>
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn list_user_repositories(
        &self,
        access_token: &str,
        per_page: Option<u8>,
        sort: Option<&str>,
    ) -> Result<Vec<GitHubRepository>> {
        let mut url = "https://api.github.com/user/repos?".to_string();

        // Add query parameters
        if let Some(per_page) = per_page {
            url.push_str(&format!("per_page={}&", per_page));
        }
        if let Some(sort) = sort {
            url.push_str(&format!("sort={}&", sort));
        }

        // Remove trailing '&' or '?'
        url = url.trim_end_matches('&').trim_end_matches('?').to_string();

        let response = self
            .http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "Macro-Auth-Service")
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| GitHubIntegrationError::UserInfoFailed(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(GitHubIntegrationError::UserInfoFailed(format!(
                "failed to list repositories: {}",
                error_body
            )));
        }

        let repositories: Vec<GitHubRepository> = response
            .json()
            .await
            .map_err(|e| GitHubIntegrationError::UserInfoFailed(e.to_string()))?;

        Ok(repositories)
    }
}

impl Default for GitHubOAuthClient {
    fn default() -> Self {
        Self::new()
    }
}
