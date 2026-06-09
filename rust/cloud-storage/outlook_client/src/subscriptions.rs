//! Change-notification subscription management against Microsoft Graph.
//!
//! This is the Outlook analogue of `gmail_client::watch`. Graph subscriptions on
//! message resources are short-lived (max ~3 days) and must be renewed
//! periodically; the email service schedules renewals before expiry.

use crate::OutlookClient;
use chrono::{Duration, Utc};
use models_email::outlook::error::OutlookError;
use models_email::outlook::subscription::{
    CreateSubscriptionRequest, RenewSubscriptionRequest, Subscription,
};

/// How far in the future to set a subscription's expiry. Graph caps message
/// subscriptions at ~4230 minutes; we use 2 days and renew well before then.
const SUBSCRIPTION_TTL_MINUTES: i64 = 2 * 24 * 60;

/// The mailbox resource we watch. Scoped to the inbox to mirror Gmail's
/// inbox-focused watch.
const WATCHED_RESOURCE: &str = "/me/mailFolders('inbox')/messages";

fn expiration_timestamp() -> String {
    (Utc::now() + Duration::minutes(SUBSCRIPTION_TTL_MINUTES)).to_rfc3339()
}

/// Create a subscription delivering inbox change notifications to our webhook.
pub(crate) async fn create_subscription(
    client: &OutlookClient,
    access_token: &str,
) -> Result<Subscription, OutlookError> {
    let url = format!("{}/subscriptions", client.base_url);

    let body = CreateSubscriptionRequest {
        change_type: "created,updated,deleted".to_string(),
        notification_url: client.notification_url.clone(),
        resource: WATCHED_RESOURCE.to_string(),
        expiration_date_time: expiration_timestamp(),
        client_state: client.client_state.clone(),
    };

    let resp = client
        .inner
        .post(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;

    OutlookClient::deserialize_success(resp).await
}

/// Renew a subscription, pushing its expiry out by the standard TTL.
pub(crate) async fn renew_subscription(
    client: &OutlookClient,
    access_token: &str,
    subscription_id: &str,
) -> Result<Subscription, OutlookError> {
    let url = format!("{}/subscriptions/{}", client.base_url, subscription_id);

    let body = RenewSubscriptionRequest {
        expiration_date_time: expiration_timestamp(),
    };

    let resp = client
        .inner
        .patch(&url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;

    OutlookClient::deserialize_success(resp).await
}

/// Delete a subscription, stopping notifications.
pub(crate) async fn delete_subscription(
    client: &OutlookClient,
    access_token: &str,
    subscription_id: &str,
) -> Result<(), OutlookError> {
    let url = format!("{}/subscriptions/{}", client.base_url, subscription_id);

    let resp = client
        .inner
        .delete(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;

    // A subscription that's already gone is fine — treat 404 as success.
    match OutlookClient::ensure_success(resp).await {
        Ok(()) | Err(OutlookError::NotFound(_)) => Ok(()),
        Err(e) => Err(e),
    }
}
