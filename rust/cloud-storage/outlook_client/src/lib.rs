//! A thin client over the [Microsoft Graph] mail API, used to integrate Outlook
//! inboxes into the email service.
//!
//! This is the Outlook analogue of the `gmail_client` crate: it exposes the same
//! kinds of operations (fetch messages/threads, incremental sync, manage
//! folders/labels, send, attachments, push-notification subscriptions) but
//! speaks Graph instead of the Gmail REST API. Where it's natural, methods
//! return the provider-agnostic structs from `models_email::email::service` so
//! the rest of the service can treat providers uniformly; lower-level methods
//! return the raw Graph resources from [`models_email::outlook`].
//!
//! Authentication is delegated to the caller: every request takes an OAuth 2.0
//! access token (minted by the authentication service from the user's linked
//! Microsoft refresh token).
//!
//! [Microsoft Graph]: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview

pub mod convert;

pub(crate) mod attachments;
pub(crate) mod delta;
pub(crate) mod folders;
pub(crate) mod messages;
pub(crate) mod profile;
pub(crate) mod subscriptions;
pub(crate) mod threads;

#[allow(unused_imports)]
use mockall::automock;
use models_email::email::service;
use models_email::email::service::address::ContactInfo;
use models_email::email::service::message;
pub use models_email::outlook::error::OutlookError;
use models_email::outlook::{
    MailFolder, MessageResource, delta::DeltaChanges, subscription::Subscription,
};
use serde::de::DeserializeOwned;

/// Default Microsoft Graph v1.0 base URL.
const DEFAULT_GRAPH_BASE_URL: &str = "https://graph.microsoft.com/v1.0";

/// Client for the Microsoft Graph mail API.
#[derive(Clone, Debug)]
pub struct OutlookClient {
    /// The inner HTTP client used to make requests.
    inner: reqwest::Client,
    /// The base url for the Graph API (e.g. `https://graph.microsoft.com/v1.0`).
    base_url: String,
    /// The HTTPS endpoint Graph posts change notifications to when we create a
    /// subscription on a user's mailbox.
    notification_url: String,
    /// Opaque secret we set as the subscription `clientState` and verify on every
    /// incoming notification.
    client_state: String,
}

impl OutlookClient {
    /// Create a new client.
    ///
    /// * `notification_url` — the public HTTPS URL Graph should deliver change
    ///   notifications to (our webhook).
    /// * `client_state` — a secret used to authenticate incoming notifications.
    pub fn new(notification_url: String, client_state: String) -> Self {
        Self {
            inner: reqwest::Client::new(),
            base_url: DEFAULT_GRAPH_BASE_URL.to_string(),
            notification_url,
            client_state,
        }
    }

    /// Override the Graph base url (used in tests against a mock server).
    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    // ---- shared request helpers ---------------------------------------------

    /// Issue an authenticated `GET` and deserialize the JSON body, mapping
    /// non-success statuses to [`OutlookError`].
    pub(crate) async fn graph_get<T: DeserializeOwned>(
        &self,
        access_token: &str,
        url: &str,
    ) -> Result<T, OutlookError> {
        let response = self
            .inner
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;

        Self::deserialize_success(response).await
    }

    /// Like [`graph_get`](Self::graph_get) but maps a `404` to `Ok(None)`.
    pub(crate) async fn graph_get_opt<T: DeserializeOwned>(
        &self,
        access_token: &str,
        url: &str,
    ) -> Result<Option<T>, OutlookError> {
        match self.graph_get::<T>(access_token, url).await {
            Ok(value) => Ok(Some(value)),
            Err(OutlookError::NotFound(_)) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Read a response, returning the deserialized body on success or the
    /// appropriate [`OutlookError`] otherwise.
    pub(crate) async fn deserialize_success<T: DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T, OutlookError> {
        let status = response.status();
        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| OutlookError::BodyReadError(e.to_string()))
        } else {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error body".to_string());
            Err(OutlookError::from_status(status.as_u16(), body))
        }
    }

    /// Ensure a response was a success, discarding its body.
    pub(crate) async fn ensure_success(response: reqwest::Response) -> Result<(), OutlookError> {
        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error body".to_string());
            Err(OutlookError::from_status(status.as_u16(), body))
        }
    }

    // ---- messages -----------------------------------------------------------

    /// Fetch a single message by its Graph id, returning the raw resource.
    /// Returns `None` if the message no longer exists.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_message(
        &self,
        access_token: &str,
        message_id: &str,
    ) -> Result<Option<MessageResource>, OutlookError> {
        messages::get_message(self, access_token, message_id).await
    }

    /// Send a message. When `parent_provider_message_id` is set the message is
    /// sent as a reply within the existing conversation (preserving threading);
    /// otherwise it's sent as a brand new message. On success `message.provider_id`
    /// and `message.provider_thread_id` are populated.
    #[tracing::instrument(
        skip(self, access_token, message, from_contact),
        fields(link_id = %message.link_id),
        err
    )]
    pub async fn send_message(
        &self,
        access_token: &str,
        message: &mut message::MessageToSend,
        from_contact: &ContactInfo,
        parent_provider_message_id: Option<String>,
    ) -> Result<(), OutlookError> {
        messages::send_message(self, access_token, message, from_contact, parent_provider_message_id)
            .await
    }

    // ---- threads (conversations) --------------------------------------------

    /// Fetch every message belonging to a conversation (the Outlook analogue of
    /// a Gmail thread), ordered oldest-first.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_conversation_messages(
        &self,
        access_token: &str,
        conversation_id: &str,
    ) -> Result<Vec<MessageResource>, OutlookError> {
        threads::get_conversation_messages(self, access_token, conversation_id).await
    }

    // ---- incremental sync (delta) -------------------------------------------

    /// Begin a delta sync of a mail folder, returning the changes seen so far
    /// plus a fresh `@odata.deltaLink` to persist. Pass the well-known inbox id
    /// (or any folder id) to scope the sync.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn initial_delta(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<DeltaChanges, OutlookError> {
        delta::run_delta(self, access_token, &delta::initial_delta_url(&self.base_url, folder_id))
            .await
    }

    /// Continue a delta sync from a previously persisted `@odata.deltaLink`.
    #[tracing::instrument(skip(self, access_token, delta_link), err)]
    pub async fn delta_from_link(
        &self,
        access_token: &str,
        delta_link: &str,
    ) -> Result<DeltaChanges, OutlookError> {
        delta::run_delta(self, access_token, delta_link).await
    }

    // ---- folders (labels) ---------------------------------------------------

    /// List the user's mail folders (the Outlook analogue of Gmail labels).
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn list_folders(
        &self,
        access_token: &str,
    ) -> Result<Vec<MailFolder>, OutlookError> {
        folders::list_folders(self, access_token).await
    }

    /// List the user's mail folders mapped to service labels, ready to persist.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn fetch_user_labels(
        &self,
        access_token: &str,
        link_id: uuid::Uuid,
    ) -> Result<Vec<service::label::Label>, OutlookError> {
        folders::fetch_user_labels(self, access_token, link_id).await
    }

    // ---- attachments --------------------------------------------------------

    /// Download the bytes of a file attachment.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_attachment_data(
        &self,
        access_token: &str,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>, OutlookError> {
        attachments::get_attachment_data(self, access_token, message_id, attachment_id).await
    }

    // ---- subscriptions (push notifications) ---------------------------------

    /// Create a change-notification subscription on the user's inbox (the
    /// Outlook analogue of registering a Gmail watch). Returns the created
    /// subscription, whose id should be persisted for renewal/teardown.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn create_subscription(
        &self,
        access_token: &str,
    ) -> Result<Subscription, OutlookError> {
        subscriptions::create_subscription(self, access_token).await
    }

    /// Renew an existing subscription's expiry (subscriptions are short-lived
    /// and must be renewed periodically).
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn renew_subscription(
        &self,
        access_token: &str,
        subscription_id: &str,
    ) -> Result<Subscription, OutlookError> {
        subscriptions::renew_subscription(self, access_token, subscription_id).await
    }

    /// Delete a subscription (the Outlook analogue of stopping a Gmail watch).
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn delete_subscription(
        &self,
        access_token: &str,
        subscription_id: &str,
    ) -> Result<(), OutlookError> {
        subscriptions::delete_subscription(self, access_token, subscription_id).await
    }

    /// Verify that a notification's `clientState` matches the secret we set when
    /// creating the subscription. Returns `true` when it matches.
    ///
    /// This is the Outlook analogue of verifying the Google-signed JWT on Gmail
    /// Pub/Sub pushes.
    pub fn verify_client_state(&self, client_state: Option<&str>) -> bool {
        client_state == Some(self.client_state.as_str())
    }

    // ---- profile ------------------------------------------------------------

    /// Fetch the signed-in user's profile (`GET /me`), used to resolve the
    /// primary SMTP address of a freshly-linked inbox.
    #[tracing::instrument(skip(self, access_token), err)]
    pub async fn get_profile(
        &self,
        access_token: &str,
    ) -> Result<models_email::outlook::UserResource, OutlookError> {
        profile::get_profile(self, access_token).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_client_state_matches_secret() {
        let client = OutlookClient::new("https://example.com/webhook".into(), "s3cr3t".into());
        assert!(client.verify_client_state(Some("s3cr3t")));
        assert!(!client.verify_client_state(Some("wrong")));
        assert!(!client.verify_client_state(None));
    }
}
