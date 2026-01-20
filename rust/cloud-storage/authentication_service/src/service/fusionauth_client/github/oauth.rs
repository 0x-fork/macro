use std::time::Duration;

use crate::service::fusionauth_client::{
    Result, UnauthedClient,
    error::{FusionAuthClientError, GenericErrorResponse},
};

#[derive(Debug, serde::Deserialize)]
pub struct GitHubExchangeTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub scope: String,
}

#[derive(Debug, serde::Serialize)]
struct TokenExchangeRequest {
    client_id: String,
    client_secret: String,
    code: String,
    redirect_uri: String,
}

/// Exchanges an authorization code for a GitHub access token
/// See https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#2-users-are-redirected-back-to-your-site-by-github
pub(in crate::service::fusionauth_client) async fn exchange_code_for_tokens(
    client: &UnauthedClient,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> Result<GitHubExchangeTokenResponse> {
    let token_request = TokenExchangeRequest {
        client_id: client_id.to_string(),
        client_secret: client_secret.to_string(),
        code: code.to_string(),
        redirect_uri: redirect_uri.to_string(),
    };

    let response = client
        .client()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&token_request)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to send github token request");
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

    let status = response.status();

    if !status.is_success() {
        let error_body = response.text().await.map_err(|e| {
            tracing::error!(error=?e, "failed to get error body");
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

        tracing::error!(status=?status, body=?error_body, "token exchange failed");
        return Err(FusionAuthClientError::Generic(GenericErrorResponse {
            message: format!(
                "token exchange failed with status {}: {}",
                status, error_body
            ),
        }));
    }

    let token_response: GitHubExchangeTokenResponse = response.json().await.map_err(|e| {
        tracing::error!(error=?e, "failed to parse token response");
        FusionAuthClientError::Generic(GenericErrorResponse {
            message: e.to_string(),
        })
    })?;

    Ok(token_response)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUserInfo {
    pub id: u64,         // GitHub user ID
    pub login: String,   // GitHub username
    pub email: Option<String>, // Primary email (may be null if private)
    pub name: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

/// Gets user information from GitHub using an access token
/// See https://docs.github.com/en/rest/users/users#get-the-authenticated-user
pub(in crate::service::fusionauth_client) async fn get_user_info(
    client: &UnauthedClient,
    access_token: &str,
) -> anyhow::Result<GitHubUserInfo> {
    // Get basic user info
    let user_response = client
        .client()
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "Macro-Auth-Service")
        .timeout(Duration::from_secs(30))
        .send()
        .await?;

    if !user_response.status().is_success() {
        let error_body = user_response.text().await?;
        anyhow::bail!("failed to get user info: {}", error_body);
    }

    let mut user_info: GitHubUserInfo = user_response.json().await?;

    // If email is not public, try to fetch from emails endpoint (optional)
    if user_info.email.is_none() {
        tracing::debug!("Email not in public profile, attempting to fetch from /user/emails");

        match client
            .client()
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
