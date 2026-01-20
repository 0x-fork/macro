use crate::service::fusionauth_client::{
    FusionAuthClient, Result,
    error::{FusionAuthClientError, GenericErrorResponse},
};

pub mod oauth;

impl FusionAuthClient {
    /// Constructs a GitHub OAuth authorization URL
    /// See https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
    #[tracing::instrument(skip(self), err)]
    pub fn construct_github_authorize_url<T>(
        &self,
        redirect_uri: &str,
        state: T,
    ) -> anyhow::Result<String>
    where
        T: serde::Serialize + std::fmt::Debug,
    {
        let state_str = serde_json::to_string(&state)?;

        let url = format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
            self.github_client_id,
            urlencoding::encode(redirect_uri),
            urlencoding::encode("repo user:email"),
            urlencoding::encode(&state_str)
        );

        Ok(url)
    }

    #[tracing::instrument(skip(self, code, redirect_uri), err)]
    pub async fn exchange_github_code_for_tokens(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<oauth::GitHubExchangeTokenResponse> {
        oauth::exchange_code_for_tokens(
            &self.unauth_client,
            &self.github_client_id,
            &self.github_client_secret,
            redirect_uri,
            code,
        )
        .await
    }

    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_github_user_info(
        &self,
        access_token: &str,
    ) -> Result<oauth::GitHubUserInfo> {
        oauth::get_user_info(&self.unauth_client, access_token)
            .await
            .map_err(|e| {
                tracing::error!(error=?e, "unable to get github user info");
                FusionAuthClientError::Generic(GenericErrorResponse {
                    message: e.to_string(),
                })
            })
    }
}
