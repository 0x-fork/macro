//! [`DriveAccessTokens`] adapter backed by `authentication_service` (which
//! holds the refresh token in FusionAuth) with a short-lived redis cache.

use std::sync::Arc;

use authentication_service_client::AuthServiceClient;
use authentication_service_client::error::AuthServiceClientError;
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use uuid::Uuid;

use crate::domain::ports::{AccessTokenError, DriveAccessTokens};

/// Cache lifetime for a Drive access token. Google access tokens live ~1 hour;
/// caching for 30 minutes amortizes the refresh round-trip while leaving ample
/// headroom before expiry.
const TTL_SECONDS: u64 = 60 * 30;

/// Builds the redis key for a user's cached Drive access token.
macro_rules! drive_access_token_key {
    ($fusionauth_user_id:expr) => {
        format!("google_drive_access_token:{}", $fusionauth_user_id)
    };
}

/// Resolves Drive access tokens via `authentication_service`, caching the
/// result in redis per FusionAuth user.
#[derive(Clone)]
pub struct AuthServiceAccessTokens {
    auth_client: Arc<AuthServiceClient>,
    conn: MultiplexedConnection,
}

impl AuthServiceAccessTokens {
    /// Create a new adapter from the auth-service client and a redis connection.
    pub fn new(auth_client: Arc<AuthServiceClient>, conn: MultiplexedConnection) -> Self {
        Self { auth_client, conn }
    }
}

impl DriveAccessTokens for AuthServiceAccessTokens {
    #[tracing::instrument(skip(self), err)]
    async fn retrieve_access_token(
        &self,
        fusionauth_user_id: &Uuid,
        email: &str,
    ) -> Result<String, AccessTokenError> {
        let key = drive_access_token_key!(fusionauth_user_id);
        let mut conn = self.conn.clone();

        if let Some(token) = conn
            .get::<&str, Option<String>>(&key)
            .await
            .map_err(|e| AccessTokenError::Internal(e.into()))?
        {
            conn.expire::<&str, ()>(&key, TTL_SECONDS as i64)
                .await
                .map_err(|e| AccessTokenError::Internal(e.into()))?;
            return Ok(token);
        }

        let token = match self
            .auth_client
            .get_google_drive_access_token(&fusionauth_user_id.to_string(), email)
            .await
        {
            Ok(token) => token.access_token,
            // A revoked/expired refresh token (403) or a missing FusionAuth link
            // (404) both mean the user has to reconnect Drive.
            Err(AuthServiceClientError::Forbidden | AuthServiceClientError::NotFound) => {
                return Err(AccessTokenError::ReauthenticationRequired);
            }
            Err(e) => return Err(AccessTokenError::Internal(e.into())),
        };

        conn.set_ex::<&str, &str, ()>(&key, &token, TTL_SECONDS)
            .await
            .map_err(|e| AccessTokenError::Internal(e.into()))?;

        Ok(token)
    }
}
