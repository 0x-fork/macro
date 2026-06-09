use std::{collections::HashMap, time::Duration};

use crate::{
    Result, UnauthedClient,
    error::{FusionAuthClientError, GenericErrorResponse},
};
use base64::{Engine, engine::general_purpose};

/// Microsoft identity platform v2.0 token endpoint. `common` supports both work/
/// school (Entra) accounts and personal Microsoft accounts.
const MICROSOFT_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/// Scopes requested when refreshing/exchanging tokens. `offline_access` is
/// required to obtain a refresh token; the Mail/User scopes back the mailbox
/// operations the `outlook_client` performs.
const MICROSOFT_SCOPES: &str =
    "offline_access openid profile email https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read";

#[derive(serde::Serialize, serde::Deserialize, Debug)]
/// Response from refreshing a Microsoft OAuth2 access token.
pub struct MicrosoftTokenResponse {
    /// The access token.
    pub access_token: String,
    /// The number of seconds until the token expires.
    #[serde(default)]
    pub expires_in: u64,
    /// The scope of the token.
    #[serde(default)]
    pub scope: String,
    /// The type of token.
    #[serde(default)]
    pub token_type: String,
    /// The ID token, if openid scope was granted.
    #[serde(default)]
    pub id_token: Option<String>,
    /// A rotated refresh token, if one was returned.
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(serde::Serialize, Debug)]
struct RefreshRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    refresh_token: &'a str,
    grant_type: &'a str,
    scope: &'a str,
}

/// Refreshes a Microsoft OAuth2 access token using a refresh token.
/// See <https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token>
pub(crate) async fn refresh_microsoft_token(
    client: &UnauthedClient,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<MicrosoftTokenResponse> {
    let token_request = RefreshRequest {
        client_id,
        client_secret,
        refresh_token,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES,
    };

    let res = client
        .client()
        .post(MICROSOFT_TOKEN_URL)
        // The Microsoft token endpoint expects application/x-www-form-urlencoded.
        .form(&token_request)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to send microsoft access token request");
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

    match res.status() {
        reqwest::StatusCode::OK => {
            let response = res.json::<MicrosoftTokenResponse>().await.map_err(|e| {
                tracing::error!(error=?e, "unable to parse microsoft token response");
                FusionAuthClientError::Generic(GenericErrorResponse {
                    message: e.to_string(),
                })
            })?;

            tracing::debug!(
                expires_in=?response.expires_in,
                scope=?response.scope,
                token_type=?response.token_type,
                "successfully refreshed Microsoft access token"
            );

            Ok(response)
        }
        status => {
            let error_text = res
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read error response".to_string());
            tracing::error!(
                status=?status,
                error=?error_text,
                "failed to refresh Microsoft access token"
            );

            // When the user revokes Macro's access (or the refresh token is
            // otherwise no longer valid) Microsoft returns invalid_grant, which
            // we surface so callers can tear the link down — mirroring Google.
            if error_text.contains("invalid_grant") {
                return Err(FusionAuthClientError::InvalidGrant);
            }

            Err(FusionAuthClientError::Generic(GenericErrorResponse {
                message: format!(
                    "Microsoft token refresh failed with status {}: {}",
                    status, error_text
                ),
            }))
        }
    }
}

#[derive(Debug, serde::Deserialize)]
/// Response from exchanging a Microsoft authorization code for tokens.
pub struct MicrosoftExchangeTokenResponse {
    /// The refresh token.
    pub refresh_token: String,
    /// The ID token.
    pub id_token: String,
}

#[derive(Debug, serde::Serialize)]
struct TokenExchangeRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    code: &'a str,
    grant_type: &'a str,
    redirect_uri: &'a str,
    scope: &'a str,
}

/// Exchanges a Microsoft authorization code for tokens.
pub(crate) async fn exchange_code_for_tokens(
    client: &UnauthedClient,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
) -> Result<MicrosoftExchangeTokenResponse> {
    let token_request = TokenExchangeRequest {
        client_id,
        client_secret,
        code,
        grant_type: "authorization_code",
        redirect_uri,
        scope: MICROSOFT_SCOPES,
    };

    let response = client
        .client()
        .post(MICROSOFT_TOKEN_URL)
        .form(&token_request)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to send microsoft token request");
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

        tracing::error!(status=?status, body=?error_body, "microsoft token exchange failed");
        return Err(FusionAuthClientError::Generic(GenericErrorResponse {
            message: format!(
                "microsoft token exchange failed with status {}: {}",
                status, error_body
            ),
        }));
    }

    let token_response: MicrosoftExchangeTokenResponse = response.json().await.map_err(|e| {
        tracing::error!(error=?e, "failed to parse microsoft token response");
        FusionAuthClientError::Generic(GenericErrorResponse {
            message: e.to_string(),
        })
    })?;

    Ok(token_response)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
/// User info extracted from a Microsoft ID token.
pub struct MicrosoftUserInfo {
    /// The immutable Microsoft object id for the user, when present.
    #[serde(default)]
    pub oid: Option<String>,
    /// The token subject.
    #[serde(default)]
    pub sub: Option<String>,
    /// The user's email address. Personal accounts populate `email`; work/school
    /// accounts often only populate `preferred_username`, so callers should fall
    /// back to that.
    #[serde(default)]
    pub email: Option<String>,
    /// The username, frequently the UPN / email for work accounts.
    #[serde(default)]
    pub preferred_username: Option<String>,
    /// Additional claims from the ID token.
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

impl MicrosoftUserInfo {
    /// Best-effort resolution of the account email, preferring `email` and
    /// falling back to `preferred_username`.
    pub fn resolved_email(&self) -> Option<&str> {
        self.email
            .as_deref()
            .or(self.preferred_username.as_deref())
    }
}

/// Decodes a Microsoft ID token without signature verification.
pub(crate) fn decode_microsoft_id_token(id_token: &str) -> anyhow::Result<MicrosoftUserInfo> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        anyhow::bail!("invalid jwt format")
    }

    let payload = parts[1];
    let decoded_bytes = general_purpose::URL_SAFE_NO_PAD.decode(payload)?;
    let decoded_str = String::from_utf8(decoded_bytes)?;
    let claims: MicrosoftUserInfo = serde_json::from_str(&decoded_str)?;

    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolved_email_prefers_email_then_upn() {
        let info = MicrosoftUserInfo {
            oid: None,
            sub: None,
            email: Some("a@contoso.com".to_string()),
            preferred_username: Some("upn@contoso.com".to_string()),
            other: HashMap::new(),
        };
        assert_eq!(info.resolved_email(), Some("a@contoso.com"));

        let info_upn_only = MicrosoftUserInfo {
            oid: None,
            sub: None,
            email: None,
            preferred_username: Some("upn@contoso.com".to_string()),
            other: HashMap::new(),
        };
        assert_eq!(info_upn_only.resolved_email(), Some("upn@contoso.com"));
    }
}
