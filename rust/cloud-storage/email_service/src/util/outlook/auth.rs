//! Outlook access-token retrieval, mirroring [`crate::util::gmail::auth`].
//!
//! Tokens are minted by the authentication service from the user's linked
//! Microsoft refresh token (`/internal/microsoft_access_token`). When the auth
//! service reports the link was revoked (HTTP 403 / `invalid_grant`) we enqueue
//! a link deletion, exactly as the Gmail path does.

use authentication_service_client::{AuthServiceClient, error::AuthServiceClientError};
use models_email::email::service::link::Link;
use models_email::email::service::pubsub::{DeletionReason, LinkManagerMessage};
use sqs_client::SQS;

/// Fetches an Outlook access token for the link, triggering link deletion if the
/// user revoked Macro's access. Intended for pubsub handlers; API handlers can
/// call [`fetch_outlook_access_token_from_link`] directly.
#[tracing::instrument(skip(auth_service_client, sqs_client))]
pub async fn fetch_token_or_delete_on_revocation(
    link: &Link,
    auth_service_client: &AuthServiceClient,
    sqs_client: &SQS,
) -> anyhow::Result<String> {
    match fetch_outlook_access_token_from_link(link, auth_service_client).await {
        Ok(token) => Ok(token),
        Err(e) if is_forbidden_error(&e) => {
            tracing::warn!(
                link_id = %link.id,
                fusionauth_user_id = %link.fusionauth_user_id,
                "User revoked access to Outlook - enqueueing link deletion"
            );

            sqs_client
                .enqueue_link_manager_notification(LinkManagerMessage::DeleteLink {
                    link_id: link.id,
                    deletion_reason: DeletionReason::AccessRevoked,
                })
                .await
                .inspect_err(|e| {
                    tracing::error!(error=?e, link_id=%link.id, "Failed to enqueue link deletion after detecting revoked Outlook access");
                })
                .ok();

            Err(e)
        }
        Err(e) => Err(e),
    }
}

/// Checks whether an error chain contains a Forbidden error from the auth service.
fn is_forbidden_error(e: &anyhow::Error) -> bool {
    e.chain().any(|cause| {
        cause
            .downcast_ref::<AuthServiceClientError>()
            .map(|e| matches!(e, AuthServiceClientError::Forbidden))
            .unwrap_or(false)
    })
}

/// Fetches an Outlook (Microsoft Graph) access token for the given link from the
/// authentication service.
///
/// TODO(outlook): add Redis caching with a provider-scoped `TokenCacheKey`, to
/// reach parity with the Gmail token path (`email::outbound::fetch_gmail_access_token`).
pub async fn fetch_outlook_access_token_from_link(
    link: &Link,
    auth_service_client: &AuthServiceClient,
) -> anyhow::Result<String> {
    let token = auth_service_client
        .get_microsoft_access_token(&link.fusionauth_user_id, link.email_address.0.as_ref())
        .await?;
    Ok(token.access_token)
}
