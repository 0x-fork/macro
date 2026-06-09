use crate::{
    FusionAuthClient, Result,
    error::{FusionAuthClientError, GenericErrorResponse},
};

/// Microsoft (Outlook) OAuth token operations.
pub mod oauth;

impl FusionAuthClient {
    /// Refreshes a Microsoft OAuth2 access token using a refresh token.
    #[tracing::instrument(skip(self, refresh_token), fields(client_id=%self.microsoft_client_id))]
    pub async fn refresh_microsoft_token(
        &self,
        refresh_token: &str,
    ) -> Result<oauth::MicrosoftTokenResponse> {
        oauth::refresh_microsoft_token(
            &self.unauth_client,
            &self.microsoft_client_id,
            &self.microsoft_client_secret,
            refresh_token,
        )
        .await
    }

    /// Exchanges a Microsoft authorization code for tokens.
    #[tracing::instrument(skip(self, code, redirect_uri))]
    pub async fn exchange_microsoft_code_for_tokens(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<oauth::MicrosoftExchangeTokenResponse> {
        oauth::exchange_code_for_tokens(
            &self.unauth_client,
            &self.microsoft_client_id,
            &self.microsoft_client_secret,
            redirect_uri,
            code,
        )
        .await
    }

    /// Parses and decodes a Microsoft ID token to extract user info.
    #[tracing::instrument(skip(self, id_token))]
    pub fn parse_microsoft_id_token(&self, id_token: &str) -> Result<oauth::MicrosoftUserInfo> {
        let result = oauth::decode_microsoft_id_token(id_token).map_err(|e| {
            tracing::error!(error=?e, "unable to parse microsoft id token");
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

        Ok(result)
    }
}
