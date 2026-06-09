//! Microsoft Graph change-notification (webhook) models.
//!
//! This is the Outlook analogue of the Gmail `watch` + Pub/Sub push flow
//! ([`crate::gmail::WatchRequest`] / [`crate::gmail::inbox_sync`]).
//!
//! Unlike Gmail (which authenticates push messages with a Google-signed JWT),
//! Graph uses two mechanisms:
//!  1. A **validation handshake**: when a subscription is created Graph sends a
//!     request with a `validationToken` query param that the endpoint must echo
//!     back as `text/plain` within 10 seconds.
//!  2. A per-notification **`clientState`** secret that we set at creation time
//!     and verify on every notification.
//!
//! Reference: <https://learn.microsoft.com/en-us/graph/change-notifications-overview>

use serde::{Deserialize, Serialize};

/// Request body for `POST /subscriptions`.
#[derive(Serialize, Debug, Clone)]
pub struct CreateSubscriptionRequest {
    /// Comma-separated list of change types, e.g. `"created,updated,deleted"`.
    #[serde(rename = "changeType")]
    pub change_type: String,
    /// HTTPS endpoint Graph will POST notifications to.
    #[serde(rename = "notificationUrl")]
    pub notification_url: String,
    /// The resource to watch, e.g. `"/me/mailFolders('inbox')/messages"`.
    pub resource: String,
    /// ISO-8601 UTC expiry. For message resources the max is ~3 days out.
    #[serde(rename = "expirationDateTime")]
    pub expiration_date_time: String,
    /// Opaque secret echoed back in every notification for verification.
    #[serde(rename = "clientState")]
    pub client_state: String,
}

/// Request body for renewing a subscription (`PATCH /subscriptions/{id}`).
#[derive(Serialize, Debug, Clone)]
pub struct RenewSubscriptionRequest {
    #[serde(rename = "expirationDateTime")]
    pub expiration_date_time: String,
}

/// The `subscription` resource returned by Graph on create / renew.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Subscription {
    pub id: String,
    #[serde(rename = "expirationDateTime", default)]
    pub expiration_date_time: Option<String>,
    #[serde(default)]
    pub resource: Option<String>,
    #[serde(rename = "changeType", default)]
    pub change_type: Option<String>,
}

/// A batch of change notifications POSTed to our webhook.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChangeNotificationCollection {
    #[serde(default)]
    pub value: Vec<ChangeNotification>,
}

/// A single change notification.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChangeNotification {
    /// The id of the subscription that produced this notification.
    #[serde(rename = "subscriptionId")]
    pub subscription_id: String,
    /// The secret we provided at subscription-creation time. Must be verified.
    #[serde(rename = "clientState", default)]
    pub client_state: Option<String>,
    /// `"created"`, `"updated"`, or `"deleted"`.
    #[serde(rename = "changeType")]
    pub change_type: String,
    /// The resource path that changed, e.g. `"Users/{uid}/Messages/{mid}"`.
    #[serde(default)]
    pub resource: Option<String>,
    /// Lightweight identifier for the changed resource.
    #[serde(rename = "resourceData", default)]
    pub resource_data: Option<ResourceData>,
}

/// The `resourceData` of a change notification — enough to fetch the full item.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceData {
    /// The provider id of the changed message.
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "@odata.type", default)]
    pub odata_type: Option<String>,
    #[serde(rename = "@odata.id", default)]
    pub odata_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_change_notification_collection() {
        let json = r##"{
            "value": [
                {
                    "subscriptionId": "sub-123",
                    "clientState": "secretvalue",
                    "changeType": "created",
                    "resource": "Users/abc/Messages/msg-1",
                    "resourceData": {
                        "id": "msg-1",
                        "@odata.type": "#Microsoft.Graph.Message",
                        "@odata.id": "Users/abc/Messages/msg-1"
                    }
                }
            ]
        }"##;

        let parsed: ChangeNotificationCollection = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.value.len(), 1);
        let n = &parsed.value[0];
        assert_eq!(n.subscription_id, "sub-123");
        assert_eq!(n.client_state.as_deref(), Some("secretvalue"));
        assert_eq!(n.change_type, "created");
        assert_eq!(n.resource_data.as_ref().unwrap().id.as_deref(), Some("msg-1"));
    }
}
