use crate::AuthServiceClient;
use crate::error::{AuthServiceClientError, GenericErrorResponse};
use model::authentication::github_token::GithubAccessToken;

impl AuthServiceClient {
    /// Gets the GitHub access token for the given FusionAuth user id.
    #[tracing::instrument(skip(self))]
    pub async fn get_github_access_token(
        &self,
        fusionauth_user_id: &str,
    ) -> Result<GithubAccessToken, AuthServiceClientError> {
        let res = self
            .client
            .get(format!("{}/internal/github_access_token", self.url))
            .query(&[("fusionauth_user_id", fusionauth_user_id)])
            .send()
            .await
            .map_err(|e| AuthServiceClientError::RequestBuildError {
                details: e.to_string(),
            })?;

        match res.status() {
            reqwest::StatusCode::OK => {
                tracing::trace!("github access token retrieved");
                let result = res.json::<GithubAccessToken>().await.map_err(|e| {
                    AuthServiceClientError::Generic(GenericErrorResponse {
                        message: e.to_string(),
                    })
                })?;

                Ok(result)
            }
            reqwest::StatusCode::UNAUTHORIZED => Err(AuthServiceClientError::Unauthorized),
            reqwest::StatusCode::FORBIDDEN => Err(AuthServiceClientError::Forbidden),
            reqwest::StatusCode::NOT_FOUND => Err(AuthServiceClientError::NotFound),
            reqwest::StatusCode::INTERNAL_SERVER_ERROR => {
                let error_message = res.text().await.map_err(|e| {
                    AuthServiceClientError::Generic(GenericErrorResponse {
                        message: e.to_string(),
                    })
                })?;

                Err(AuthServiceClientError::InternalServerError {
                    details: error_message,
                })
            }
            _ => {
                let body = res.text().await.map_err(|e| {
                    AuthServiceClientError::Generic(GenericErrorResponse {
                        message: e.to_string(),
                    })
                })?;

                Err(AuthServiceClientError::Generic(GenericErrorResponse {
                    message: body,
                }))
            }
        }
    }
}
