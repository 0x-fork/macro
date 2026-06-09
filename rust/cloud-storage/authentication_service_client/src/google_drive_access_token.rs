use crate::AuthServiceClient;
use crate::error::{AuthServiceClientError, GenericErrorResponse};
use model::authentication::google_token::GoogleAccessToken;

impl AuthServiceClient {
    /// Gets a Google **Drive** access token for the given fusionauth user and
    /// linked email. Mirrors [`Self::get_google_access_token`] but resolves the
    /// token from the `google_drive` identity provider rather than
    /// `google_gmail`. `email` corresponds to the `display_name` on the
    /// FusionAuth Drive IdP link (the connected Google account's email).
    #[tracing::instrument(skip(self))]
    pub async fn get_google_drive_access_token(
        &self,
        fusionauth_user_id: &str,
        email: &str,
    ) -> Result<GoogleAccessToken, AuthServiceClientError> {
        let res = self
            .client
            .get(format!("{}/internal/google_drive_access_token", self.url))
            .query(&[("fusionauth_user_id", fusionauth_user_id)])
            .query(&[("email", email)])
            .send()
            .await
            .map_err(|e| AuthServiceClientError::RequestBuildError {
                details: e.to_string(),
            })?;

        match res.status() {
            reqwest::StatusCode::OK => {
                tracing::trace!("user drive access token retrieved");
                let result = res.json::<GoogleAccessToken>().await.map_err(|e| {
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
